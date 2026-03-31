// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package sso

import (
	"context"
	"fmt"
	"log/slog"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/dynamic"

	udstypes "github.com/defenseunicorns/uds-core/src/go-controller/api/uds/v1alpha1"
	"github.com/defenseunicorns/uds-core/src/go-controller/internal/config"
	"github.com/defenseunicorns/uds-core/src/go-controller/internal/resources"
	"github.com/defenseunicorns/uds-core/src/go-controller/internal/utils"
)

var (
	authPolicyGVR       = schema.GroupVersionResource{Group: "security.istio.io", Version: "v1beta1", Resource: "authorizationpolicies"}
	requestAuthGVR      = schema.GroupVersionResource{Group: "security.istio.io", Version: "v1beta1", Resource: "requestauthentications"}
)

const (
	prometheusPrincipal = "cluster.local/ns/monitoring/sa/kube-prometheus-stack-prometheus"
	waypointSuffix      = "-waypoint"
	authserviceLabel    = "authservice"
)

// monitorExemption holds port+path pairs that should bypass authservice/JWT auth.
type monitorExemption struct {
	port string
	path string
}

// ReconcileAuthservicePolicies creates the three Istio resources per authservice client:
//   - {name}-authservice  AuthorizationPolicy (CUSTOM, routes unauthenticated traffic to authservice)
//   - {name}-jwt-authn    RequestAuthentication (validates JWTs from Keycloak)
//   - {name}-jwt-authz    AuthorizationPolicy (DENY, rejects requests without valid JWT)
func ReconcileAuthservicePolicies(ctx context.Context, dynamicClient dynamic.Interface, pkg *udstypes.UDSPackage, namespace string, istioMode udstypes.Mode) error {
	pkgName := pkg.Name
	generation := utils.PkgGeneration(pkg)
	ownerRefs := utils.GetOwnerRef(pkg)
	domain := config.Get().Domain

	slog.Debug("Authservice policy reconcile started",
		"package", pkgName, "namespace", namespace, "istioMode", istioMode)

	for _, ssoSpec := range pkg.Spec.Sso {
		if len(ssoSpec.EnableAuthserviceSelector) == 0 {
			continue
		}

		name := utils.SanitizeResourceName(ssoSpec.ClientID)
		labelSelector := ssoSpec.EnableAuthserviceSelector
		exemptions := computeMonitorExemptions(pkg, labelSelector, istioMode)
		waypointName := name + waypointSuffix

		slog.Debug("Reconciling authservice policies",
			"package", pkgName, "clientId", ssoSpec.ClientID, "name", name)

		// 1. AuthorizationPolicy: CUSTOM (routes unauthenticated traffic to authservice)
		authserviceAP := buildAuthserviceAuthPolicy(name, namespace, pkgName, generation, ownerRefs, labelSelector, exemptions, istioMode, waypointName)
		if err := resources.ServerSideApply(ctx, dynamicClient, authPolicyGVR, authserviceAP); err != nil {
			return fmt.Errorf("apply authservice AuthorizationPolicy for %s: %w", name, err)
		}

		// 2. RequestAuthentication: validates JWTs from Keycloak
		reqAuthn := buildRequestAuthentication(name, namespace, pkgName, generation, ownerRefs, labelSelector, domain, ssoSpec.ClientID, istioMode, waypointName)
		if err := resources.ServerSideApply(ctx, dynamicClient, requestAuthGVR, reqAuthn); err != nil {
			return fmt.Errorf("apply RequestAuthentication for %s: %w", name, err)
		}

		// 3. AuthorizationPolicy: DENY (rejects requests without valid JWT)
		jwtAuthzAP := buildJwtAuthzAuthPolicy(name, namespace, pkgName, generation, ownerRefs, labelSelector, exemptions, domain, istioMode, waypointName)
		if err := resources.ServerSideApply(ctx, dynamicClient, authPolicyGVR, jwtAuthzAP); err != nil {
			return fmt.Errorf("apply JWT authz AuthorizationPolicy for %s: %w", name, err)
		}
	}

	// Purge orphaned authservice policies (separate label from network auth policies)
	extraLabels := map[string]string{"uds/for": authserviceLabel}
	if err := resources.PurgeOrphans(ctx, dynamicClient, authPolicyGVR, namespace, pkgName, generation, extraLabels); err != nil {
		slog.Error("Failed to purge orphaned authservice AuthorizationPolicies", "error", err)
	}
	if err := resources.PurgeOrphans(ctx, dynamicClient, requestAuthGVR, namespace, pkgName, generation, extraLabels); err != nil {
		slog.Error("Failed to purge orphaned RequestAuthentications", "error", err)
	}

	return nil
}

// PurgeAuthservicePolicies removes all authservice Istio policies for a package being deleted.
func PurgeAuthservicePolicies(ctx context.Context, dynamicClient dynamic.Interface, namespace, pkgName string) {
	extraLabels := map[string]string{"uds/for": authserviceLabel}
	if err := resources.PurgeOrphans(ctx, dynamicClient, authPolicyGVR, namespace, pkgName, "", extraLabels); err != nil {
		slog.Error("Failed to purge authservice AuthorizationPolicies", "package", pkgName, "error", err)
	}
	if err := resources.PurgeOrphans(ctx, dynamicClient, requestAuthGVR, namespace, pkgName, "", extraLabels); err != nil {
		slog.Error("Failed to purge RequestAuthentications", "package", pkgName, "error", err)
	}
}

func buildAuthserviceAuthPolicy(name, namespace, pkgName, generation string, ownerRefs []metav1.OwnerReference, labelSelector map[string]string, exemptions []monitorExemption, istioMode udstypes.Mode, waypointName string) *unstructured.Unstructured {
	unauthWhen := []interface{}{
		map[string]interface{}{
			"key":       "request.headers[authorization]",
			"notValues": []interface{}{"*"},
		},
	}

	var rules []interface{}
	nonMetricsOps := buildNonMetricsOps(exemptions)
	if len(nonMetricsOps) == 0 {
		// No monitor exemptions: route all unauthenticated traffic through authservice
		rules = []interface{}{
			map[string]interface{}{"when": unauthWhen},
		}
	} else {
		// Only route non-metrics unauthenticated traffic through authservice
		rules = []interface{}{
			map[string]interface{}{
				"to":   nonMetricsOps,
				"when": unauthWhen,
			},
		}
	}

	spec := map[string]interface{}{
		"action":   "CUSTOM",
		"provider": map[string]interface{}{"name": "authservice"},
		"rules":    rules,
	}
	setPolicyTarget(spec, labelSelector, istioMode, waypointName, namespace)

	return buildPolicyObject(utils.SanitizeResourceName(name+"-authservice"), namespace, pkgName, generation, ownerRefs, spec)
}

func buildRequestAuthentication(name, namespace, pkgName, generation string, ownerRefs []metav1.OwnerReference, labelSelector map[string]string, domain, clientID string, istioMode udstypes.Mode, waypointName string) *unstructured.Unstructured {
	issuer := fmt.Sprintf("https://sso.%s/realms/uds", domain)
	spec := map[string]interface{}{
		"jwtRules": []interface{}{
			map[string]interface{}{
				"audiences":            []interface{}{clientID},
				"issuer":               issuer,
				"jwksUri":              fmt.Sprintf("%s/protocol/openid-connect/certs", issuer),
				"forwardOriginalToken": true,
			},
		},
	}
	setPolicyTarget(spec, labelSelector, istioMode, waypointName, namespace)

	obj := buildPolicyObject(utils.SanitizeResourceName(name+"-jwt-authn"), namespace, pkgName, generation, ownerRefs, spec)
	obj.SetAPIVersion("security.istio.io/v1beta1")
	obj.SetKind("RequestAuthentication")
	return obj
}

func buildJwtAuthzAuthPolicy(name, namespace, pkgName, generation string, ownerRefs []metav1.OwnerReference, labelSelector map[string]string, exemptions []monitorExemption, domain string, istioMode udstypes.Mode, waypointName string) *unstructured.Unstructured {
	ssoJwtSource := map[string]interface{}{
		"notRequestPrincipals": []interface{}{
			fmt.Sprintf("https://sso.%s/realms/uds/*", domain),
		},
	}
	promOrSsoSource := map[string]interface{}{
		"notRequestPrincipals": []interface{}{
			fmt.Sprintf("https://sso.%s/realms/uds/*", domain),
		},
		"notPrincipals": []interface{}{prometheusPrincipal},
	}

	var rules []interface{}
	metricsOps := buildMetricsOps(exemptions)
	nonMetricsOps := buildNonMetricsOps(exemptions)

	if len(metricsOps) == 0 {
		// No monitor exemptions: deny any request without valid JWT
		rules = []interface{}{
			map[string]interface{}{
				"from": []interface{}{map[string]interface{}{"source": ssoJwtSource}},
			},
		}
	} else {
		// Deny metrics requests that are neither Prometheus nor JWT-authenticated
		rules = []interface{}{
			map[string]interface{}{
				"from": []interface{}{map[string]interface{}{"source": promOrSsoSource}},
				"to":   metricsOps,
			},
			// Deny non-metrics requests without valid JWT
			map[string]interface{}{
				"from": []interface{}{map[string]interface{}{"source": ssoJwtSource}},
				"to":   nonMetricsOps,
			},
		}
	}

	spec := map[string]interface{}{
		"action": "DENY",
		"rules":  rules,
	}
	setPolicyTarget(spec, labelSelector, istioMode, waypointName, namespace)

	return buildPolicyObject(utils.SanitizeResourceName(name+"-jwt-authz"), namespace, pkgName, generation, ownerRefs, spec)
}

// setPolicyTarget sets either a targetRef (ambient) or selector (sidecar) on the policy spec.
func setPolicyTarget(spec map[string]interface{}, labelSelector map[string]string, istioMode udstypes.Mode, waypointName, namespace string) {
	if istioMode == udstypes.Ambient && waypointName != "" {
		spec["targetRef"] = map[string]interface{}{
			"group": "gateway.networking.k8s.io",
			"kind":  "Gateway",
			"name":  waypointName,
		}
		delete(spec, "selector")
	} else if len(labelSelector) > 0 {
		labels := make(map[string]interface{}, len(labelSelector))
		for k, v := range labelSelector {
			labels[k] = v
		}
		spec["selector"] = map[string]interface{}{"matchLabels": labels}
		delete(spec, "targetRef")
	}
}

func buildPolicyObject(name, namespace, pkgName, generation string, ownerRefs []metav1.OwnerReference, spec map[string]interface{}) *unstructured.Unstructured {
	obj := &unstructured.Unstructured{
		Object: map[string]interface{}{
			"apiVersion": "security.istio.io/v1beta1",
			"kind":       "AuthorizationPolicy",
			"metadata": map[string]interface{}{
				"name":      name,
				"namespace": namespace,
				"labels": map[string]interface{}{
					"uds/package":    pkgName,
					"uds/generation": generation,
					"uds/for":        authserviceLabel,
				},
			},
			"spec": spec,
		},
	}
	if len(ownerRefs) > 0 {
		var refs []interface{}
		for _, r := range ownerRefs {
			refs = append(refs, map[string]interface{}{
				"apiVersion": r.APIVersion,
				"kind":       r.Kind,
				"name":       r.Name,
				"uid":        string(r.UID),
			})
		}
		unstructured.SetNestedSlice(obj.Object, refs, "metadata", "ownerReferences")
	}
	return obj
}

// computeMonitorExemptions returns port+path pairs for monitors whose selectors
// overlap with the authservice label selector (so metrics bypass auth).
func computeMonitorExemptions(pkg *udstypes.UDSPackage, labelSelector map[string]string, istioMode udstypes.Mode) []monitorExemption {
	var exemptions []monitorExemption

	for _, m := range pkg.Spec.Monitor {
		sel := m.Selector
		if len(m.PodSelector) > 0 {
			sel = m.PodSelector
		}
		if labelsMatch(sel, labelSelector) {
			path := "/metrics"
			if m.Path != nil {
				path = *m.Path
			}
			exemptions = append(exemptions, monitorExemption{
				port: fmt.Sprintf("%d", int32(m.TargetPort)),
				path: path,
			})
		}
	}

	// In sidecar mode, also exempt the Istio sidecar metrics endpoint
	if istioMode == udstypes.Sidecar {
		exemptions = append(exemptions, monitorExemption{port: "15020", path: "/stats/prometheus"})
	}

	return exemptions
}

// labelsMatch returns true if all labels in selector are present in target,
// or if selector is empty (matches all).
func labelsMatch(target, selector map[string]string) bool {
	if len(selector) == 0 {
		return true
	}
	for k, v := range selector {
		if target[k] != v {
			return false
		}
	}
	return true
}

// buildNonMetricsOps builds operation entries matching everything EXCEPT the exempt metrics endpoints.
func buildNonMetricsOps(exemptions []monitorExemption) []interface{} {
	if len(exemptions) == 0 {
		return nil
	}

	// Group by port
	portPaths := map[string][]string{}
	for _, ex := range exemptions {
		portPaths[ex.port] = append(portPaths[ex.port], ex.path)
	}

	var ops []interface{}
	var allPorts []interface{}
	for port, paths := range portPaths {
		allPorts = append(allPorts, port)
		notPaths := make([]interface{}, len(paths))
		for i, p := range paths {
			notPaths[i] = p
		}
		ops = append(ops, map[string]interface{}{
			"operation": map[string]interface{}{
				"ports":    []interface{}{port},
				"notPaths": notPaths,
			},
		})
	}
	// Catch-all for all other ports
	ops = append(ops, map[string]interface{}{
		"operation": map[string]interface{}{"notPorts": allPorts},
	})
	return ops
}

// buildMetricsOps builds operation entries matching the exempt metrics endpoints exactly.
func buildMetricsOps(exemptions []monitorExemption) []interface{} {
	if len(exemptions) == 0 {
		return nil
	}

	portPaths := map[string][]string{}
	for _, ex := range exemptions {
		portPaths[ex.port] = append(portPaths[ex.port], ex.path)
	}

	var ops []interface{}
	for port, paths := range portPaths {
		pathInterfaces := make([]interface{}, len(paths))
		for i, p := range paths {
			pathInterfaces[i] = p
		}
		ops = append(ops, map[string]interface{}{
			"operation": map[string]interface{}{
				"ports": []interface{}{port},
				"paths": pathInterfaces,
			},
		})
	}
	return ops
}
