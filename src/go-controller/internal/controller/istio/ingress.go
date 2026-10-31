// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package istio

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"strings"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/dynamic"
	"k8s.io/utils/ptr"

	udstypes "github.com/defenseunicorns/uds-core/src/go-controller/api/uds/v1alpha1"
	"github.com/defenseunicorns/uds-core/src/go-controller/internal/config"
	"github.com/defenseunicorns/uds-core/src/go-controller/internal/resources"
	"github.com/defenseunicorns/uds-core/src/go-controller/internal/utils"
)

var (
	virtualServiceGVR = schema.GroupVersionResource{Group: "networking.istio.io", Version: "v1beta1", Resource: "virtualservices"}
	serviceEntryGVR   = schema.GroupVersionResource{Group: "networking.istio.io", Version: "v1beta1", Resource: "serviceentries"}
)

// ReconcileIngress creates VirtualServices and ServiceEntries for all exposed
// services in the package and returns the list of endpoints (FQDNs).
func ReconcileIngress(ctx context.Context, client dynamic.Interface, pkg *udstypes.UDSPackage, namespace string) ([]string, error) {
	pkgName := pkg.Name
	generation := utils.PkgGeneration(pkg)
	ownerRefs := utils.GetOwnerRef(pkg)

	endpointSet := map[string]struct{}{}
	desiredServiceEntries := map[string]bool{}
	legacyServiceEntries := map[string]bool{}
	var endpoints []string

	slog.Debug("Istio ingress reconcile started",
		"package", pkgName, "namespace", namespace,
		"exposeCount", len(pkg.Spec.GetExpose()),
		"domain", config.Get().Domain, "adminDomain", config.Get().AdminDomain)

	for _, expose := range pkg.Spec.GetExpose() {
		if expose.Protocol != nil && *expose.Protocol == udstypes.ExposeUDP {
			continue
		}
		fqdn := getFqdn(expose)
		if _, seen := endpointSet[fqdn]; !seen {
			endpointSet[fqdn] = struct{}{}
			endpoints = append(endpoints, fqdn)
		}

		gateway := normalizeGateway(expose.Gateway)
		service := ptr.Deref(expose.Service, "")
		slog.Debug("Processing expose entry",
			"package", pkgName, "host", ptr.Deref(expose.Host, ""), "fqdn", fqdn,
			"gateway", gateway, "service", service,
			"port", expose.Port, "hasAdvancedHTTP", expose.AdvancedHTTP != nil)

		// Create VirtualService
		vs := buildVirtualService(expose, pkgName, namespace, generation, ownerRefs, fqdn)
		slog.Debug("Applying VirtualService",
			"name", vs.GetName(), "namespace", namespace, "fqdn", fqdn)
		if err := resources.ServerSideApply(ctx, client, virtualServiceGVR, vs); err != nil {
			return nil, fmt.Errorf("apply VirtualService for %s: %w", fqdn, err)
		}
		slog.Debug("Applied VirtualService successfully", "name", vs.GetName())

		// Create ServiceEntry
		se := buildIngressServiceEntry(expose, pkgName, namespace, generation, ownerRefs, fqdn)
		slog.Debug("Applying ServiceEntry",
			"name", se.GetName(), "namespace", namespace, "fqdn", fqdn)
		if err := resources.ServerSideApply(ctx, client, serviceEntryGVR, se); err != nil {
			return nil, fmt.Errorf("apply ServiceEntry for %s: %w", fqdn, err)
		}
		desiredServiceEntries[se.GetName()] = true
		legacyServiceEntries[legacyIngressServiceEntryName(expose, pkgName)] = true
		slog.Debug("Applied ServiceEntry successfully", "name", se.GetName())
	}

	// Purge orphaned VirtualServices and ServiceEntries
	if err := resources.PurgeOrphans(ctx, client, virtualServiceGVR, namespace, pkgName, generation, nil, pkg.UID); err != nil {
		return nil, err
	}
	if err := resources.PurgeOrphans(ctx, client, serviceEntryGVR, namespace, pkgName, generation, nil, pkg.UID); err != nil {
		return nil, err
	}
	if err := purgeIngressServiceEntryAliases(ctx, client, pkg, desiredServiceEntries, legacyServiceEntries); err != nil {
		return nil, err
	}

	return endpoints, nil
}

func buildVirtualService(expose udstypes.Expose, pkgName, namespace, generation string, ownerRefs []metav1.OwnerReference, fqdn string) *unstructured.Unstructured {
	gateway := normalizeGateway(expose.Gateway)
	port := getPort(expose)
	service := ptr.Deref(expose.Service, "")
	if service == "" {
		service = ptr.Deref(expose.Host, "")
	}

	hostName := ptr.Deref(expose.Host, "")
	if hostName == "." {
		hostName = "root-domain"
	}
	matchNames := []string{}
	if expose.AdvancedHTTP != nil {
		for _, match := range expose.AdvancedHTTP.Match {
			if match.Name != nil {
				matchNames = append(matchNames, *match.Name)
			}
		}
	}
	suffix := fmt.Sprintf("%s-%v-%s-%s", hostName, ptr.Deref(expose.Port, 0), service, strings.Join(matchNames, "-"))
	if expose.Description != nil && *expose.Description != "" {
		suffix = *expose.Description
	}
	name := utils.SanitizeResourceName(pkgName + "-" + gateway + "-" + suffix)

	gatewayRef := fmt.Sprintf("istio-%s-gateway/%s-gateway", gateway, gateway)
	destination := map[string]interface{}{
		"host": fmt.Sprintf("%s.%s.svc.cluster.local", service, namespace),
		"port": map[string]interface{}{
			"number": int64(port),
		},
	}

	spec := map[string]interface{}{
		"hosts":    []interface{}{fqdn},
		"gateways": []interface{}{gatewayRef},
	}

	if strings.Contains(gateway, "passthrough") {
		spec["tls"] = []interface{}{
			map[string]interface{}{
				"match": []interface{}{
					map[string]interface{}{
						"port":     int64(443),
						"sniHosts": []interface{}{fqdn},
					},
				},
				"route": []interface{}{
					map[string]interface{}{"destination": destination},
				},
			},
		}
	} else {
		httpRoute := map[string]interface{}{
			"route": []interface{}{
				map[string]interface{}{"destination": destination},
			},
		}

		// Apply advanced HTTP settings if present
		if expose.AdvancedHTTP != nil {
			applyAdvancedHTTP(httpRoute, expose.AdvancedHTTP)
		}

		spec["http"] = []interface{}{httpRoute}
	}

	vs := &unstructured.Unstructured{
		Object: map[string]interface{}{
			"apiVersion": "networking.istio.io/v1beta1",
			"kind":       "VirtualService",
			"metadata": map[string]interface{}{
				"name":      name,
				"namespace": namespace,
				"labels": map[string]interface{}{
					"uds/package":    pkgName,
					"uds/generation": generation,
				},
			},
			"spec": spec,
		},
	}
	setOwnerRefs(vs, ownerRefs)
	return vs
}

func buildIngressServiceEntry(expose udstypes.Expose, pkgName, namespace, generation string, ownerRefs []metav1.OwnerReference, fqdn string) *unstructured.Unstructured {
	gateway := normalizeGateway(expose.Gateway)
	name := ingressServiceEntryName(pkgName, gateway, fqdn)

	se := &unstructured.Unstructured{
		Object: map[string]interface{}{
			"apiVersion": "networking.istio.io/v1beta1",
			"kind":       "ServiceEntry",
			"metadata": map[string]interface{}{
				"name":      name,
				"namespace": namespace,
				"labels": map[string]interface{}{
					"uds/package":    pkgName,
					"uds/generation": generation,
					"uds/for":        "ingress",
				},
			},
			"spec": map[string]interface{}{
				"hosts":      []interface{}{fqdn},
				"location":   "MESH_INTERNAL",
				"resolution": "DNS",
				"ports": []interface{}{
					map[string]interface{}{
						"name":     "https",
						"number":   int64(443),
						"protocol": "HTTPS",
					},
				},
				"endpoints": []interface{}{
					map[string]interface{}{
						"address": fmt.Sprintf("%s-ingressgateway.istio-%s-gateway.svc.cluster.local", gateway, gateway),
					},
				},
			},
		},
	}
	setOwnerRefs(se, ownerRefs)
	return se
}

func getFqdn(expose udstypes.Expose) string {
	cfg := config.Get()
	gateway := normalizeGateway(expose.Gateway)

	domain := cfg.Domain
	if strings.Contains(gateway, "admin") {
		domain = cfg.AdminDomain
	}
	if expose.Domain != nil && *expose.Domain != "" {
		domain = *expose.Domain
	}

	if ptr.Deref(expose.Host, "") == "." {
		return domain
	}
	return fmt.Sprintf("%s.%s", ptr.Deref(expose.Host, ""), domain)
}

func normalizeGateway(gw *string) string {
	if gw == nil || *gw == "" {
		return "tenant"
	}
	return strings.ToLower(*gw)
}

func getPort(expose udstypes.Expose) int32 {
	if expose.Port != nil {
		return int32(*expose.Port)
	}
	return 443
}

func applyAdvancedHTTP(route map[string]interface{}, adv *udstypes.AdvancedHTTP) {
	data, _ := json.Marshal(adv)
	values := map[string]interface{}{}
	_ = json.Unmarshal(data, &values)
	for key, value := range values {
		route[key] = value
	}
	if adv.Redirect != nil || adv.DirectResponse != nil {
		delete(route, "route")
	}
}

func stringMatchToMap(sm *udstypes.StringMatch) map[string]interface{} {
	m := map[string]interface{}{}
	if sm.Exact != nil {
		m["exact"] = *sm.Exact
	}
	if sm.Prefix != nil {
		m["prefix"] = *sm.Prefix
	}
	if sm.Regex != nil {
		m["regex"] = *sm.Regex
	}
	return m
}

func toStringInterfaceMap(m map[string]string) map[string]interface{} {
	result := make(map[string]interface{}, len(m))
	for k, v := range m {
		result[k] = v
	}
	return result
}

func toStringSliceInterface(s []string) []interface{} {
	result := make([]interface{}, len(s))
	for i, v := range s {
		result[i] = v
	}
	return result
}

func setOwnerRefs(obj *unstructured.Unstructured, refs []metav1.OwnerReference) {
	if len(refs) > 0 {
		var refMaps []interface{}
		for _, ref := range refs {
			refMaps = append(refMaps, map[string]interface{}{
				"apiVersion": ref.APIVersion,
				"kind":       ref.Kind,
				"name":       ref.Name,
				"uid":        string(ref.UID),
			})
		}
		unstructured.SetNestedSlice(obj.Object, refMaps, "metadata", "ownerReferences")
	}
}

func ingressHostName(host string) string {
	if host == "." {
		return "root-domain"
	}
	return host
}
