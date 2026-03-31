// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

// Package authpolicy creates Istio AuthorizationPolicies for UDS Packages.
package authpolicy

import (
	"context"
	"fmt"
	"log/slog"
	"sort"
	"strings"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/dynamic"

	udstypes "github.com/defenseunicorns/uds-core/src/go-controller/api/uds/v1alpha1"
	"github.com/defenseunicorns/uds-core/src/go-controller/internal/resources"
	"github.com/defenseunicorns/uds-core/src/go-controller/internal/utils"
)

var authPolicyGVR = schema.GroupVersionResource{
	Group: "security.istio.io", Version: "v1beta1", Resource: "authorizationpolicies",
}

const (
	prometheusPrincipal = "cluster.local/ns/monitoring/sa/kube-prometheus-stack-prometheus"
	waypointSuffix      = "-waypoint"
)

// Reconcile creates Istio AuthorizationPolicies and returns the count of policies.
func Reconcile(ctx context.Context, client dynamic.Interface, pkg *udstypes.UDSPackage, namespace string, istioMode udstypes.Mode) (int, error) {
	pkgName := pkg.Name
	generation := utils.PkgGeneration(pkg)
	ownerRefs := utils.GetOwnerRef(pkg)

	var policies []*unstructured.Unstructured

	slog.Debug("AuthorizationPolicy reconcile started",
		"package", pkgName, "namespace", namespace, "istioMode", istioMode,
		"allowRules", len(pkg.Spec.GetAllow()),
		"exposeRules", len(pkg.Spec.GetExpose()),
		"monitors", len(pkg.Spec.Monitor))

	// Process allow rules (ingress only)
	for _, allow := range pkg.Spec.GetAllow() {
		if allow.Direction != udstypes.Ingress {
			continue
		}

		selector := mergeSelectors(allow.Selector, allow.PodLabels)
		source := buildAllowSource(allow, namespace)
		ports := getAllowPorts(allow)

		sso := findMatchingSsoClient(pkg, selector, istioMode)
		if sso != nil {
			waypointName := utils.SanitizeResourceName(sso.ClientID) + waypointSuffix
			waypointSelector := map[string]string{"istio.io/gateway-name": waypointName}
			name := utils.SanitizeResourceName(fmt.Sprintf("protect-%s-allow-%s-%s", pkgName, generateAllowName(allow), waypointName))
			pol := buildAuthPolicy(name, namespace, generation, ownerRefs, waypointSelector, source, ports, pkgName, istioMode)
			policies = append(policies, pol)
		} else {
			name := utils.SanitizeResourceName(fmt.Sprintf("protect-%s-%s", pkgName, generateAllowName(allow)))
			pol := buildAuthPolicy(name, namespace, generation, ownerRefs, selector, source, ports, pkgName, istioMode)
			policies = append(policies, pol)
		}
	}

	// Process expose rules
	for _, expose := range pkg.Spec.GetExpose() {
		if expose.AdvancedHTTP != nil && expose.AdvancedHTTP.DirectResponse != nil {
			continue
		}

		gateway := utils.DerefString(expose.Gateway)
		if gateway == "" {
			gateway = "tenant"
		}
		gateway = strings.ToLower(gateway)

		selector := mergeSelectors(expose.Selector, expose.PodLabels)
		port := int32(443)
		if expose.Port != nil {
			port = int32(*expose.Port)
		}
		if expose.TargetPort != nil {
			port = int32(*expose.TargetPort)
		}

		// Source: the ingress gateway service account
		source := map[string]interface{}{
			"principals": []interface{}{
				fmt.Sprintf("cluster.local/ns/istio-%s-gateway/sa/%s-ingressgateway", gateway, gateway),
			},
		}

		sso := findMatchingSsoClient(pkg, selector, istioMode)
		if sso != nil {
			// Ambient + SSO: target the waypoint instead of the app pod.
			// Use expose.Port (not targetPort) to match Pepr behavior.
			exposePort := int32(443)
			if expose.Port != nil {
				exposePort = int32(*expose.Port)
			}
			waypointName := utils.SanitizeResourceName(sso.ClientID) + waypointSuffix
			waypointSelector := map[string]string{"istio.io/gateway-name": waypointName}
			labelString := joinSelectorKeyValue(selector)
			desc := fmt.Sprintf("ingress-%d-%s-%s", exposePort, labelString, waypointName)
			name := utils.SanitizeResourceName(fmt.Sprintf("protect-%s-%s", pkgName, desc))
			pol := buildAuthPolicy(name, namespace, generation, ownerRefs, waypointSelector, source, []string{fmt.Sprintf("%d", exposePort)}, pkgName, istioMode)
			policies = append(policies, pol)
		} else {
			desc := fmt.Sprintf("%d-%s-%s-gateway", port, joinMapValues(selector), gateway)
			name := utils.SanitizeResourceName(fmt.Sprintf("protect-%s-%s", pkgName, desc))
			pol := buildAuthPolicy(name, namespace, generation, ownerRefs, selector, source, []string{fmt.Sprintf("%d", port)}, pkgName, istioMode)
			policies = append(policies, pol)
		}
	}

	// Process monitor rules
	for _, monitor := range pkg.Spec.Monitor {
		monitorSelector := monitor.Selector
		if len(monitor.PodSelector) > 0 {
			monitorSelector = monitor.PodSelector
		}
		port := fmt.Sprintf("%d", int32(monitor.TargetPort))

		source := map[string]interface{}{
			"principals": []interface{}{prometheusPrincipal},
		}

		sso := findMatchingSsoClient(pkg, monitorSelector, istioMode)
		if sso != nil {
			waypointName := utils.SanitizeResourceName(sso.ClientID) + waypointSuffix
			waypointSelector := map[string]string{"istio.io/gateway-name": waypointName}
			monitorName := generateMonitorName(monitor)
			name := utils.SanitizeResourceName(fmt.Sprintf("protect-%s-monitor-%s-%s", pkgName, monitorName, waypointName))
			pol := buildAuthPolicy(name, namespace, generation, ownerRefs, waypointSelector, source, []string{port}, pkgName, istioMode)
			policies = append(policies, pol)
		} else {
			name := utils.SanitizeResourceName(fmt.Sprintf("protect-%s-%s-%s-metrics", pkgName, port, joinMapValues(monitorSelector)))
			pol := buildAuthPolicy(name, namespace, generation, ownerRefs, monitorSelector, source, []string{port}, pkgName, istioMode)
			policies = append(policies, pol)
		}
	}

	// Sidecar mode: allow Prometheus to scrape sidecar metrics on 15020
	if istioMode == udstypes.Sidecar {
		source := map[string]interface{}{
			"principals": []interface{}{prometheusPrincipal},
		}
		name := utils.SanitizeResourceName(fmt.Sprintf("protect-%s-sidecar-metrics", pkgName))
		pol := buildAuthPolicy(name, namespace, generation, ownerRefs, nil, source, []string{"15020"}, pkgName, istioMode)
		policies = append(policies, pol)
	}

	// Ambient mode: deny all traffic to app pods except from their waypoint,
	// enforced at the ztunnel L4 layer for each authservice-protected SSO client.
	if istioMode == udstypes.Ambient {
		for _, ssoSpec := range pkg.Spec.Sso {
			if len(ssoSpec.EnableAuthserviceSelector) == 0 {
				continue
			}
			waypointName := utils.SanitizeResourceName(ssoSpec.ClientID) + waypointSuffix
			denyPol := buildDenyWaypointPolicy(waypointName, namespace, generation, ownerRefs, ssoSpec.EnableAuthserviceSelector, pkgName, istioMode)
			policies = append(policies, denyPol)
		}
	}

	// Apply all policies
	for _, pol := range policies {
		if err := resources.ServerSideApply(ctx, client, authPolicyGVR, pol); err != nil {
			return 0, fmt.Errorf("apply AuthorizationPolicy %s: %w", pol.GetName(), err)
		}
		slog.Debug("Applied AuthorizationPolicy", "name", pol.GetName(), "namespace", namespace)
	}

	// Purge orphans
	if err := resources.PurgeOrphans(ctx, client, authPolicyGVR, namespace, pkgName, generation, map[string]string{"uds/for": "network"}); err != nil {
		slog.Error("Failed to purge orphaned AuthorizationPolicies", "error", err)
	}

	return len(policies), nil
}

func buildAuthPolicy(name, namespace, generation string, ownerRefs []metav1.OwnerReference, selector map[string]string, source map[string]interface{}, ports []string, pkgName string, istioMode udstypes.Mode) *unstructured.Unstructured {
	spec := map[string]interface{}{
		"action": "ALLOW",
	}

	if len(selector) > 0 {
		spec["selector"] = map[string]interface{}{
			"matchLabels": toInterfaceMap(selector),
		}
	}

	rule := map[string]interface{}{}
	if source != nil {
		rule["from"] = []interface{}{
			map[string]interface{}{"source": source},
		}
	}
	if len(ports) > 0 {
		var portInterfaces []interface{}
		for _, p := range ports {
			portInterfaces = append(portInterfaces, p)
		}
		rule["to"] = []interface{}{
			map[string]interface{}{
				"operation": map[string]interface{}{
					"ports": portInterfaces,
				},
			},
		}
	}
	spec["rules"] = []interface{}{rule}

	pol := &unstructured.Unstructured{
		Object: map[string]interface{}{
			"apiVersion": "security.istio.io/v1beta1",
			"kind":       "AuthorizationPolicy",
			"metadata": map[string]interface{}{
				"name":      name,
				"namespace": namespace,
				"labels": map[string]interface{}{
					"uds/package":    pkgName,
					"uds/generation": generation,
					"uds/for":        "network",
					"uds/mesh-mode":  string(istioMode),
				},
			},
			"spec": spec,
		},
	}

	if len(ownerRefs) > 0 {
		var refMaps []interface{}
		for _, ref := range ownerRefs {
			refMaps = append(refMaps, map[string]interface{}{
				"apiVersion": ref.APIVersion,
				"kind":       ref.Kind,
				"name":       ref.Name,
				"uid":        string(ref.UID),
			})
		}
		unstructured.SetNestedSlice(pol.Object, refMaps, "metadata", "ownerReferences")
	}

	return pol
}

func buildAllowSource(allow udstypes.Allow, namespace string) map[string]interface{} {
	if allow.RemoteServiceAccount != nil {
		ns := namespace
		if allow.RemoteNamespace != nil {
			ns = *allow.RemoteNamespace
		}
		return map[string]interface{}{
			"principals": []interface{}{
				fmt.Sprintf("cluster.local/ns/%s/sa/%s", ns, *allow.RemoteServiceAccount),
			},
		}
	}

	if allow.RemoteNamespace != nil {
		ns := *allow.RemoteNamespace
		if ns == "*" || ns == "" {
			return nil // Allow from all
		}
		return map[string]interface{}{
			"namespaces": []interface{}{ns},
		}
	}

	return nil
}

func getAllowPorts(allow udstypes.Allow) []string {
	var ports []string
	if allow.Port != nil {
		ports = append(ports, fmt.Sprintf("%d", int32(*allow.Port)))
	}
	for _, p := range allow.Ports {
		ports = append(ports, fmt.Sprintf("%d", int32(p)))
	}
	return ports
}

func generateAllowName(allow udstypes.Allow) string {
	if allow.Description != nil && *allow.Description != "" {
		return *allow.Description
	}
	parts := []string{string(allow.Direction)}
	sel := mergeSelectors(allow.Selector, allow.PodLabels)
	if len(sel) > 0 {
		parts = append(parts, joinMapValues(sel))
	}
	if allow.RemoteNamespace != nil {
		parts = append(parts, *allow.RemoteNamespace)
	}
	return strings.Join(parts, "-")
}

func mergeSelectors(primary, deprecated map[string]string) map[string]string {
	if len(primary) > 0 {
		return primary
	}
	return deprecated
}

func joinMapValues(m map[string]string) string {
	if len(m) == 0 {
		return "all"
	}
	vals := make([]string, 0, len(m))
	for _, v := range m {
		vals = append(vals, v)
	}
	return strings.Join(vals, "-")
}

func toInterfaceMap(m map[string]string) map[string]interface{} {
	result := make(map[string]interface{}, len(m))
	for k, v := range m {
		result[k] = v
	}
	return result
}

// joinSelectorKeyValue joins map entries as "key-value" pairs, sorted for stability.
func joinSelectorKeyValue(m map[string]string) string {
	if len(m) == 0 {
		return "all"
	}
	// Sort keys for deterministic output
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	parts := make([]string, 0, len(m))
	for _, k := range keys {
		parts = append(parts, k+"-"+m[k])
	}
	return strings.Join(parts, "-")
}

// generateMonitorName mirrors Pepr's generateMonitorName.
func generateMonitorName(monitor udstypes.Monitor) string {
	selector := monitor.Selector
	if len(monitor.PodSelector) > 0 {
		selector = monitor.PodSelector
	}
	portPart := fmt.Sprintf("%d", int32(monitor.TargetPort))

	if v, ok := selector["app"]; ok {
		return fmt.Sprintf("monitor-%s-%s", portPart, strings.TrimSuffix(v, "-pod"))
	}
	if v, ok := selector["app.kubernetes.io/name"]; ok {
		return fmt.Sprintf("monitor-%s-%s-workload", portPart, strings.TrimSuffix(v, "-pod"))
	}
	if len(selector) > 0 {
		return fmt.Sprintf("monitor-%s-%s", portPart, joinMapValues(selector))
	}
	return fmt.Sprintf("monitor-%s-workload", portPart)
}

// findMatchingSsoClient returns the first SSO spec whose enableAuthserviceSelector
// is a subset of the given selector. Only applies in Ambient mode.
func findMatchingSsoClient(pkg *udstypes.UDSPackage, selector map[string]string, istioMode udstypes.Mode) *udstypes.Sso {
	if istioMode != udstypes.Ambient || selector == nil {
		return nil
	}
	for i := range pkg.Spec.Sso {
		sso := &pkg.Spec.Sso[i]
		if len(sso.EnableAuthserviceSelector) == 0 {
			continue
		}
		match := true
		for k, v := range sso.EnableAuthserviceSelector {
			if selector[k] != v {
				match = false
				break
			}
		}
		if match {
			return sso
		}
	}
	return nil
}

// buildDenyWaypointPolicy creates a DENY AuthorizationPolicy that blocks all traffic
// to the app pods except traffic originating from the waypoint service account.
func buildDenyWaypointPolicy(waypointName, namespace, generation string, ownerRefs []metav1.OwnerReference, appSelector map[string]string, pkgName string, istioMode udstypes.Mode) *unstructured.Unstructured {
	name := utils.SanitizeResourceName("deny-all-except-waypoint-" + waypointName)

	spec := map[string]interface{}{
		"action": "DENY",
		"rules": []interface{}{
			map[string]interface{}{
				"from": []interface{}{
					map[string]interface{}{
						"source": map[string]interface{}{
							"notPrincipals": []interface{}{
								fmt.Sprintf("cluster.local/ns/%s/sa/%s", namespace, waypointName),
							},
						},
					},
				},
			},
		},
	}

	if len(appSelector) > 0 {
		spec["selector"] = map[string]interface{}{
			"matchLabels": toInterfaceMap(appSelector),
		}
	}

	pol := &unstructured.Unstructured{
		Object: map[string]interface{}{
			"apiVersion": "security.istio.io/v1beta1",
			"kind":       "AuthorizationPolicy",
			"metadata": map[string]interface{}{
				"name":      name,
				"namespace": namespace,
				"labels": map[string]interface{}{
					"uds/package":          pkgName,
					"uds/generation":       generation,
					"uds/for":              "network",
					"uds/mesh-mode":        string(istioMode),
					"uds/ambient-waypoint": waypointName,
				},
			},
			"spec": spec,
		},
	}

	if len(ownerRefs) > 0 {
		var refMaps []interface{}
		for _, ref := range ownerRefs {
			refMaps = append(refMaps, map[string]interface{}{
				"apiVersion": ref.APIVersion,
				"kind":       ref.Kind,
				"name":       ref.Name,
				"uid":        string(ref.UID),
			})
		}
		unstructured.SetNestedSlice(pol.Object, refMaps, "metadata", "ownerReferences")
	}

	return pol
}
