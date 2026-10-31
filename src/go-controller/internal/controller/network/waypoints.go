// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

// Package network creates and manages Kubernetes NetworkPolicies for UDS Packages.
package network

import (
	"fmt"

	networkingv1 "k8s.io/api/networking/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	"k8s.io/apimachinery/pkg/util/intstr"

	udstypes "github.com/defenseunicorns/uds-core/src/go-controller/api/uds/v1alpha1"

	"github.com/defenseunicorns/uds-core/src/go-controller/internal/utils"
)

func authserviceEgress(namespace string, sso udstypes.Sso, istioMode udstypes.Mode, waypointName string) *networkingv1.NetworkPolicy {
	port := intstr.FromInt32(10003)
	desc := utils.SanitizeResourceName(sso.ClientID) + " authservice egress"
	// In ambient mode the waypoint makes the egress connection, so select the waypoint pod
	podSel := podSelectorForSSO(sso.EnableAuthserviceSelector, istioMode, waypointName)
	return &networkingv1.NetworkPolicy{
		ObjectMeta: metav1.ObjectMeta{
			Name:      utils.SanitizeResourceName(desc),
			Namespace: namespace,
			Labels:    make(map[string]string),
		},
		Spec: networkingv1.NetworkPolicySpec{
			PodSelector: metav1.LabelSelector{MatchLabels: podSel},
			PolicyTypes: []networkingv1.PolicyType{networkingv1.PolicyTypeEgress},
			Egress: []networkingv1.NetworkPolicyEgressRule{
				{
					To: []networkingv1.NetworkPolicyPeer{
						{
							NamespaceSelector: &metav1.LabelSelector{
								MatchLabels: map[string]string{"kubernetes.io/metadata.name": "authservice"},
							},
							PodSelector: &metav1.LabelSelector{
								MatchLabels: map[string]string{"app.kubernetes.io/name": "authservice"},
							},
						},
					},
					Ports: []networkingv1.NetworkPolicyPort{{Port: &port}},
				},
			},
		},
	}
}

func keycloakEgress(namespace string, sso udstypes.Sso, istioMode udstypes.Mode, waypointName string) *networkingv1.NetworkPolicy {
	port := intstr.FromInt32(8080)
	desc := utils.SanitizeResourceName(sso.ClientID) + " keycloak JWKS egress"
	// In ambient mode the waypoint makes the egress connection, so select the waypoint pod
	podSel := podSelectorForSSO(sso.EnableAuthserviceSelector, istioMode, waypointName)
	return &networkingv1.NetworkPolicy{
		ObjectMeta: metav1.ObjectMeta{
			Name:      utils.SanitizeResourceName(desc),
			Namespace: namespace,
			Labels:    make(map[string]string),
		},
		Spec: networkingv1.NetworkPolicySpec{
			PodSelector: metav1.LabelSelector{MatchLabels: podSel},
			PolicyTypes: []networkingv1.PolicyType{networkingv1.PolicyTypeEgress},
			Egress: []networkingv1.NetworkPolicyEgressRule{
				{
					To: []networkingv1.NetworkPolicyPeer{
						{
							NamespaceSelector: &metav1.LabelSelector{
								MatchLabels: map[string]string{"kubernetes.io/metadata.name": "keycloak"},
							},
							PodSelector: &metav1.LabelSelector{
								MatchLabels: map[string]string{"app.kubernetes.io/name": "keycloak"},
							},
						},
					},
					Ports: []networkingv1.NetworkPolicyPort{{Port: &port}},
				},
			},
		},
	}
}

// waypointIstiodEgress allows the waypoint pod to reach istiod (required for control-plane registration).
func waypointIstiodEgress(namespace, waypointName string) *networkingv1.NetworkPolicy {
	port := intstr.FromInt32(15012)
	desc := fmt.Sprintf("%s istiod egress", waypointName)
	return &networkingv1.NetworkPolicy{
		ObjectMeta: metav1.ObjectMeta{
			Name:      utils.SanitizeResourceName(desc),
			Namespace: namespace,
			Labels:    make(map[string]string),
		},
		Spec: networkingv1.NetworkPolicySpec{
			PodSelector: metav1.LabelSelector{MatchLabels: waypointSelector(waypointName)},
			PolicyTypes: []networkingv1.PolicyType{networkingv1.PolicyTypeEgress},
			Egress: []networkingv1.NetworkPolicyEgressRule{
				{
					To: []networkingv1.NetworkPolicyPeer{
						{
							NamespaceSelector: &metav1.LabelSelector{
								MatchLabels: map[string]string{"kubernetes.io/metadata.name": "istio-system"},
							},
							PodSelector: &metav1.LabelSelector{
								MatchLabels: map[string]string{"istio": "pilot"},
							},
						},
					},
					Ports: []networkingv1.NetworkPolicyPort{{Port: &port}},
				},
			},
		},
	}
}

// waypointToAppEgress allows the waypoint pod to forward traffic to the protected app pods.
func waypointToAppEgress(namespace, waypointName string, appSelector map[string]string) *networkingv1.NetworkPolicy {
	desc := fmt.Sprintf("Allow traffic from %s to app", waypointName)
	return &networkingv1.NetworkPolicy{
		ObjectMeta: metav1.ObjectMeta{
			Name:      utils.SanitizeResourceName(desc),
			Namespace: namespace,
			Labels:    make(map[string]string),
		},
		Spec: networkingv1.NetworkPolicySpec{
			PodSelector: metav1.LabelSelector{MatchLabels: waypointSelector(waypointName)},
			PolicyTypes: []networkingv1.PolicyType{networkingv1.PolicyTypeEgress},
			Egress: []networkingv1.NetworkPolicyEgressRule{
				{
					To: []networkingv1.NetworkPolicyPeer{
						{PodSelector: &metav1.LabelSelector{MatchLabels: appSelector}},
					},
				},
			},
		},
	}
}

// appFromWaypointIngress allows the app pods to receive traffic forwarded by the waypoint.
func appFromWaypointIngress(namespace, waypointName string, appSelector map[string]string) *networkingv1.NetworkPolicy {
	desc := fmt.Sprintf("Allow traffic from %s to app pods", waypointName)
	return &networkingv1.NetworkPolicy{
		ObjectMeta: metav1.ObjectMeta{
			Name:      utils.SanitizeResourceName(desc),
			Namespace: namespace,
			Labels:    make(map[string]string),
		},
		Spec: networkingv1.NetworkPolicySpec{
			PodSelector: metav1.LabelSelector{MatchLabels: appSelector},
			PolicyTypes: []networkingv1.PolicyType{networkingv1.PolicyTypeIngress},
			Ingress: []networkingv1.NetworkPolicyIngressRule{
				{
					From: []networkingv1.NetworkPolicyPeer{
						{PodSelector: &metav1.LabelSelector{MatchLabels: waypointSelector(waypointName)}},
					},
				},
			},
		},
	}
}

// waypointMonitoringIngress allows prometheus to scrape the waypoint's metrics endpoint.
func waypointMonitoringIngress(namespace, waypointName string) *networkingv1.NetworkPolicy {
	port := intstr.FromInt32(15020)
	desc := fmt.Sprintf("Allow health checks from monitoring to %s", waypointName)
	return &networkingv1.NetworkPolicy{
		ObjectMeta: metav1.ObjectMeta{
			Name:      utils.SanitizeResourceName(desc),
			Namespace: namespace,
			Labels:    make(map[string]string),
		},
		Spec: networkingv1.NetworkPolicySpec{
			PodSelector: metav1.LabelSelector{MatchLabels: waypointSelector(waypointName)},
			PolicyTypes: []networkingv1.PolicyType{networkingv1.PolicyTypeIngress},
			Ingress: []networkingv1.NetworkPolicyIngressRule{
				{
					From: []networkingv1.NetworkPolicyPeer{
						{
							NamespaceSelector: &metav1.LabelSelector{
								MatchLabels: map[string]string{"kubernetes.io/metadata.name": "monitoring"},
							},
							PodSelector: &metav1.LabelSelector{
								MatchLabels: map[string]string{"app": "prometheus"},
							},
						},
					},
					Ports: []networkingv1.NetworkPolicyPort{{Port: &port}},
				},
			},
		},
	}
}

// waypointSuffix matches the constant used in the sso package.
const waypointSuffix = "-waypoint"

// waypointSelector returns the label selector that identifies a waypoint pod by name.
func waypointSelector(waypointName string) map[string]string {
	return map[string]string{"istio.io/gateway-name": waypointName}
}

// podSelectorForSSO returns the waypoint pod selector in ambient mode, the app selector otherwise.
func podSelectorForSSO(appSelector map[string]string, istioMode udstypes.Mode, waypointName string) map[string]string {
	if istioMode == udstypes.Ambient {
		return waypointSelector(waypointName)
	}
	return appSelector
}

// sanitizeID mirrors utils.SanitizeResourceName for building waypoint names.
func sanitizeID(id string) string {
	return utils.SanitizeResourceName(id)
}

// findMatchingWaypoint returns the waypoint name if the given selector matches an authservice
// client in the package (ambient mode only). Returns "" if no match or not in ambient mode.
// istioMode must be the already-resolved mode (from pkg.Spec.GetServiceMeshMode()).
func findMatchingWaypoint(pkg *udstypes.UDSPackage, selector map[string]string, istioMode udstypes.Mode) string {
	if istioMode != udstypes.Ambient || selector == nil {
		return ""
	}
	for _, sso := range pkg.Spec.Sso {
		if sso.EnableAuthserviceSelector == nil {
			continue
		}
		if labelsMatchAll(selector, sso.EnableAuthserviceSelector) {
			return utils.WaypointName(sso.ClientID)
		}
	}
	return ""
}

// labelsMatchAll returns true if every key/value in required is present in target.
func labelsMatchAll(target, required map[string]string) bool {
	for k, v := range required {
		if target[k] != v {
			return false
		}
	}
	return true
}
