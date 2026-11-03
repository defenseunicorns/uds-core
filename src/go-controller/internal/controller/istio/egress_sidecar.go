// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package istio

import (
	"context"
	"fmt"
	udstypes "github.com/defenseunicorns/uds-core/src/go-controller/api/uds/v1alpha1"
	"github.com/defenseunicorns/uds-core/src/go-controller/internal/resources"
	"github.com/defenseunicorns/uds-core/src/go-controller/internal/utils"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/dynamic"
	"sort"
	"strings"
)

var istioGatewayGVR = schema.GroupVersionResource{Group: "networking.istio.io", Version: "v1beta1", Resource: "gateways"}

const sidecarEgressNS = "istio-egress-gateway"
const sharedSidecarLabel = "shared-egress-resource"

func reconcileSharedSidecar(ctx context.Context, client dynamic.Interface, packages []*udstypes.UDSPackage) error {
	merged := map[string][]hostPortProtocol{}
	owners := map[string][]string{}
	for _, pkg := range packages {
		if pkg.Spec.GetServiceMeshMode() != udstypes.Sidecar {
			continue
		}
		hosts, err := hostMapFor(pkg)
		if err != nil {
			return err
		}
		for host, ports := range hosts {
			for _, port := range ports {
				for _, existing := range merged[host] {
					if existing.Port == port.Port && existing.Protocol != port.Protocol {
						return fmt.Errorf("protocol conflict for %s:%d", host, port.Port)
					}
				}
			}
			merged[host] = append(merged[host], ports...)
			owners[host] = append(owners[host], pkg.Name+"-"+pkg.Namespace)
		}
	}
	desiredGW := map[string]bool{}
	desiredVS := map[string]bool{}
	desiredSE := map[string]bool{}
	for host, ports := range merged {
		ports = sortedPorts(ports)
		sort.Strings(owners[host])
		gwName := utils.SanitizeResourceName("gateway-" + host)
		annotations := map[string]interface{}{}
		for _, owner := range owners[host] {
			annotations["uds.dev/user-"+owner] = "user"
		}
		servers := []interface{}{}
		httpRoutes := []interface{}{}
		tlsRoutes := []interface{}{}
		for _, port := range ports {
			servers = append(servers, map[string]interface{}{"hosts": []interface{}{host}, "port": map[string]interface{}{"name": fmt.Sprintf("%s-%d", strings.ToLower(port.Protocol), port.Port), "number": int64(port.Port), "protocol": port.Protocol}, "tls": map[string]interface{}{"mode": "PASSTHROUGH"}})
			for _, gateway := range []string{"mesh", gwName} {
				match := map[string]interface{}{"gateways": []interface{}{gateway}, "port": int64(port.Port)}
				if port.Protocol == "TLS" {
					match["sniHosts"] = []interface{}{host}
				}
				destination := host
				if gateway == "mesh" {
					destination = "egressgateway." + sidecarEgressNS + ".svc.cluster.local"
				}
				route := map[string]interface{}{"match": []interface{}{match}, "route": []interface{}{map[string]interface{}{"destination": map[string]interface{}{"host": destination, "port": map[string]interface{}{"number": int64(port.Port)}}}}}
				if port.Protocol == "TLS" {
					tlsRoutes = append(tlsRoutes, route)
				} else {
					httpRoutes = append(httpRoutes, route)
				}
			}
		}
		gw := sharedSidecarObject("Gateway", gwName, annotations, map[string]interface{}{"selector": map[string]interface{}{"app": "egressgateway"}, "servers": servers})
		if err := resources.ServerSideApply(ctx, client, istioGatewayGVR, gw); err != nil {
			return err
		}
		desiredGW[gw.GetName()] = true
		vsSpec := map[string]interface{}{"hosts": []interface{}{host}, "gateways": []interface{}{"mesh", gwName}}
		if len(httpRoutes) > 0 {
			vsSpec["http"] = httpRoutes
		}
		if len(tlsRoutes) > 0 {
			vsSpec["tls"] = tlsRoutes
		}
		vs := sharedSidecarObject("VirtualService", utils.SanitizeResourceName("virtual-service-"+host), annotations, vsSpec)
		if err := resources.ServerSideApply(ctx, client, virtualServiceGVR, vs); err != nil {
			return err
		}
		desiredVS[vs.GetName()] = true
		se := buildLocalEgressServiceEntry(host, ports, "shared", sidecarEgressNS, "", nil)
		se.SetName(utils.SanitizeResourceName("service-entry-" + host))
		se.SetLabels(map[string]string{"uds/package": sharedSidecarLabel})
		rawAnnotations := map[string]string{}
		for key, value := range annotations {
			rawAnnotations[key] = value.(string)
		}
		se.SetAnnotations(rawAnnotations)
		if err := resources.ServerSideApply(ctx, client, serviceEntryGVR, se); err != nil {
			return err
		}
		desiredSE[se.GetName()] = true
	}
	for _, kind := range []struct {
		gvr   schema.GroupVersionResource
		names map[string]bool
	}{{istioGatewayGVR, desiredGW}, {virtualServiceGVR, desiredVS}, {serviceEntryGVR, desiredSE}} {
		if err := purgeByNames(ctx, client, kind.gvr, sidecarEgressNS, "uds/package="+sharedSidecarLabel, kind.names); err != nil {
			return err
		}
	}
	return nil
}
func sharedSidecarObject(kind, name string, annotations, spec map[string]interface{}) *unstructured.Unstructured {
	return &unstructured.Unstructured{Object: map[string]interface{}{"apiVersion": "networking.istio.io/v1beta1", "kind": kind, "metadata": map[string]interface{}{"name": name, "namespace": sidecarEgressNS, "labels": map[string]interface{}{"uds/package": sharedSidecarLabel}, "annotations": annotations}, "spec": spec}}
}
