// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package envoygateway

import (
	"context"
	"fmt"
	udstypes "github.com/defenseunicorns/uds-core/src/go-controller/api/uds/v1alpha1"
	udslister "github.com/defenseunicorns/uds-core/src/go-controller/client/listers/uds/v1alpha1"
	"github.com/defenseunicorns/uds-core/src/go-controller/internal/resources"
	"github.com/defenseunicorns/uds-core/src/go-controller/internal/utils"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/labels"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/kubernetes"
	"k8s.io/utils/ptr"
	"sort"
)

var routeGVR = schema.GroupVersionResource{Group: "gateway.networking.k8s.io", Version: "v1", Resource: "udproutes"}
var gatewayGVR = schema.GroupVersionResource{Group: "gateway.networking.k8s.io", Version: "v1", Resource: "gateways"}
var classGVR = schema.GroupVersionResource{Group: "gateway.networking.k8s.io", Version: "v1", Resource: "gatewayclasses"}

const defaultGateway = "envoy-default-gateway"

type listener struct {
	Namespace, Package string
	Port               int64
}

func Reconcile(ctx context.Context, client dynamic.Interface, kubeClient kubernetes.Interface, pkg *udstypes.UDSPackage, lister udslister.UDSPackageLister) error {
	desired := map[string]bool{}
	for _, entry := range pkg.Spec.GetExpose() {
		if pkg.DeletionTimestamp != nil || entry.Protocol == nil || *entry.Protocol != udstypes.ExposeUDP {
			continue
		}
		gateway := ptr.Deref(entry.Gateway, defaultGateway)
		if gateway == "" {
			gateway = defaultGateway
		}
		parent := map[string]interface{}{"name": gateway, "namespace": gateway}
		if gateway == defaultGateway {
			if _, err := client.Resource(classGVR).Get(ctx, "envoy-gateway", metav1.GetOptions{}); err != nil {
				return fmt.Errorf("default UDP Gateway requires GatewayClass envoy-gateway: %w", err)
			}
			parent["sectionName"] = fmt.Sprintf("udp-%d", int64(ptr.Deref(entry.Port, 0)))
		} else {
			if _, err := kubeClient.CoreV1().Namespaces().Get(ctx, gateway, metav1.GetOptions{}); err != nil {
				return err
			}
		}
		suffix := fmt.Sprintf("%v", ptr.Deref(entry.Port, 0))
		if entry.Description != nil {
			suffix = *entry.Description
		}
		name := utils.SanitizeResourceName(pkg.Name + "-udp-" + suffix)
		route := &unstructured.Unstructured{Object: map[string]interface{}{"apiVersion": "gateway.networking.k8s.io/v1", "kind": "UDPRoute", "metadata": map[string]interface{}{"name": name, "namespace": pkg.Namespace, "labels": map[string]interface{}{"uds/package": pkg.Name, "uds/generation": utils.PkgGeneration(pkg)}}, "spec": map[string]interface{}{"parentRefs": []interface{}{parent}, "rules": []interface{}{map[string]interface{}{"backendRefs": []interface{}{map[string]interface{}{"name": ptr.Deref(entry.Service, ""), "port": int64(ptr.Deref(entry.Port, 0))}}}}}}}
		route.SetOwnerReferences(utils.GetOwnerRef(pkg))
		if err := resources.ServerSideApply(ctx, client, routeGVR, route); err != nil {
			return err
		}
		desired[name] = true
	}
	list, err := client.Resource(routeGVR).Namespace(pkg.Namespace).List(ctx, metav1.ListOptions{LabelSelector: "uds/package=" + pkg.Name})
	if err != nil && !(len(desired) == 0 && apierrors.IsNotFound(err)) {
		return err
	}
	if list != nil {
		for _, old := range list.Items {
			if !desired[old.GetName()] {
				uid := old.GetUID()
				if err := client.Resource(routeGVR).Namespace(pkg.Namespace).Delete(ctx, old.GetName(), metav1.DeleteOptions{Preconditions: &metav1.Preconditions{UID: &uid}}); err != nil && !apierrors.IsNotFound(err) {
					return err
				}
			}
		}
	}
	packages, err := lister.List(labels.Everything())
	if err != nil {
		return err
	}
	live := []*udstypes.UDSPackage{}
	for _, other := range packages {
		if other.Namespace == pkg.Namespace && other.Name == pkg.Name {
			continue
		}
		live = append(live, other)
	}
	live = append(live, pkg)
	listeners, err := defaultListeners(live)
	if err != nil {
		return err
	}
	if len(listeners) == 0 {
		err := client.Resource(gatewayGVR).Namespace(defaultGateway).Delete(ctx, defaultGateway, metav1.DeleteOptions{})
		if apierrors.IsNotFound(err) {
			return nil
		}
		return err
	}
	gateway := &unstructured.Unstructured{Object: map[string]interface{}{"apiVersion": "gateway.networking.k8s.io/v1", "kind": "Gateway", "metadata": map[string]interface{}{"name": defaultGateway, "namespace": defaultGateway, "labels": map[string]interface{}{"uds/package": "shared-envoy-gateway-resource"}}, "spec": map[string]interface{}{"gatewayClassName": "envoy-gateway", "listeners": listeners}}}
	return resources.ServerSideApply(ctx, client, gatewayGVR, gateway)
}

func defaultListeners(packages []*udstypes.UDSPackage) ([]interface{}, error) {
	ports := map[int64]listener{}
	for _, pkg := range packages {
		if pkg.DeletionTimestamp != nil {
			continue
		}
		for _, entry := range pkg.Spec.GetExpose() {
			if entry.Protocol == nil || *entry.Protocol != udstypes.ExposeUDP || ptr.Deref(entry.Gateway, "") != "" {
				continue
			}
			port := int64(ptr.Deref(entry.Port, 0))
			if owner, exists := ports[port]; exists && (owner.Namespace != pkg.Namespace || owner.Package != pkg.Name) {
				return nil, fmt.Errorf("default UDP listener port %d already owned by Package %s/%s", port, owner.Namespace, owner.Package)
			}
			ports[port] = listener{pkg.Namespace, pkg.Name, port}
		}
	}
	numbers := []int64{}
	for port := range ports {
		numbers = append(numbers, port)
	}
	sort.Slice(numbers, func(i, j int) bool { return numbers[i] < numbers[j] })
	result := []interface{}{}
	for _, port := range numbers {
		owner := ports[port]
		result = append(result, map[string]interface{}{"name": fmt.Sprintf("udp-%d", port), "protocol": "UDP", "port": port, "allowedRoutes": map[string]interface{}{"namespaces": map[string]interface{}{"from": "Selector", "selector": map[string]interface{}{"matchLabels": map[string]interface{}{"kubernetes.io/metadata.name": owner.Namespace}}}}})
	}
	return result, nil
}
