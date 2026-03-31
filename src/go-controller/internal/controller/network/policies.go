// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

// Package network creates and manages Kubernetes NetworkPolicies for UDS Packages.
package network

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"sort"
	"strings"

	corev1 "k8s.io/api/core/v1"
	networkingv1 "k8s.io/api/networking/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/apimachinery/pkg/util/intstr"
	networkingv1client "k8s.io/client-go/kubernetes/typed/networking/v1"

	udstypes "github.com/defenseunicorns/uds-core/src/go-controller/api/uds/v1alpha1"
	"github.com/defenseunicorns/uds-core/src/go-controller/internal/config"
	"github.com/defenseunicorns/uds-core/src/go-controller/internal/utils"
)

// Reconcile creates all NetworkPolicies for the given package and returns
// the count of policies created.
func Reconcile(ctx context.Context, netClient networkingv1client.NetworkingV1Interface, pkg *udstypes.UDSPackage,
	namespace string, istioMode udstypes.Mode) (int, error) {
	pkgName := pkg.Name
	generation := utils.PkgGeneration(pkg)
	ownerRefs := utils.GetOwnerRef(pkg)

	slog.Debug("Network policy reconcile started",
		"package", pkgName, "namespace", namespace, "istioMode", istioMode,
		"allowRules", len(pkg.Spec.GetAllow()),
		"exposeRules", len(pkg.Spec.GetExpose()),
		"monitors", len(pkg.Spec.Monitor),
		"ssoClients", len(pkg.Spec.Sso),
		"generation", generation)

	var policies []*networkingv1.NetworkPolicy

	// 1. Default deny-all policy
	policies = append(policies, defaultDenyAll(namespace))

	// 2. DNS egress policy
	policies = append(policies, dnsEgress(namespace))

	// 3. Istio mode-specific defaults
	if istioMode == udstypes.Sidecar {
		policies = append(policies, istiodEgress(namespace))
		policies = append(policies, sidecarMonitoring(namespace))
	} else {
		policies = append(policies, ambientHealthProbes(namespace))
	}

	// 4. Custom allow rules from spec
	for i, allow := range pkg.Spec.GetAllow() {
		slog.Debug("Generating custom allow policy",
			"package", pkgName, "index", i,
			"direction", allow.Direction,
			"description", utils.DerefString(allow.Description),
			"port", allow.Port,
			"remoteGenerated", allow.RemoteGenerated,
			"remoteHost", allow.RemoteHost)
		// In ambient mode, redirect ingress selectors that match an authservice client to the waypoint pod
		if allow.Direction == udstypes.Ingress && len(mergeSelectors(allow.Selector, allow.PodLabels)) > 0 {
			if waypointName := findMatchingWaypoint(pkg, mergeSelectors(allow.Selector, allow.PodLabels), istioMode); waypointName != "" {
				allow.Selector = waypointSelector(waypointName)
				allow.PodLabels = nil
			}
		}
		pol := generatePolicy(namespace, allow, istioMode)
		policies = append(policies, pol)
	}

	// 5. VirtualService-generated ingress policies (for exposed services)
	for _, expose := range pkg.Spec.GetExpose() {
		if expose.AdvancedHTTP != nil && expose.AdvancedHTTP.DirectResponse != nil {
			slog.Debug("Skipping expose with directResponse",
				"package", pkgName, "host", expose.Host)
			continue
		}
		slog.Debug("Generating expose ingress policy",
			"package", pkgName, "host", expose.Host,
			"gateway", utils.DerefString(expose.Gateway),
			"port", expose.Port)
		pol := generateExposePolicy(namespace, expose, pkg, istioMode)
		policies = append(policies, pol)
	}

	// 6. Monitor ingress policies
	for _, monitor := range pkg.Spec.Monitor {
		slog.Debug("Generating monitor ingress policy",
			"package", pkgName, "portName", monitor.PortName,
			"targetPort", monitor.TargetPort)
		pol := generateMonitorPolicy(namespace, monitor, pkg, istioMode)
		policies = append(policies, pol)
	}

	// 7. SSO/Authservice policies
	for _, sso := range pkg.Spec.Sso {
		if len(sso.EnableAuthserviceSelector) == 0 {
			continue
		}
		waypointName := sanitizeID(sso.ClientID) + waypointSuffix
		slog.Debug("Generating SSO authservice/keycloak policies",
			"package", pkgName, "clientId", sso.ClientID,
			"selector", sso.EnableAuthserviceSelector)
		policies = append(policies, authserviceEgress(namespace, sso, istioMode, waypointName))
		policies = append(policies, keycloakEgress(namespace, sso, istioMode, waypointName))

		// In ambient mode, add waypoint-specific network policies
		if istioMode == udstypes.Ambient {
			policies = append(policies, waypointIstiodEgress(namespace, waypointName))
			policies = append(policies, waypointToAppEgress(namespace, waypointName, sso.EnableAuthserviceSelector))
			policies = append(policies, appFromWaypointIngress(namespace, waypointName, sso.EnableAuthserviceSelector))
			policies = append(policies, waypointMonitoringIngress(namespace, waypointName))
		}
	}

	// Apply transformations to all policies
	for idx, pol := range policies {
		// Set apiVersion and kind (required for server-side apply)
		pol.APIVersion = "networking.k8s.io/v1"
		pol.Kind = "NetworkPolicy"

		// Set name prefix
		if idx == 0 {
			pol.Name = utils.SanitizeResourceName(fmt.Sprintf("deny-%s-%s", pkgName, pol.Name))
		} else {
			pol.Name = utils.SanitizeResourceName(fmt.Sprintf("allow-%s-%s", pkgName, pol.Name))
		}

		// Set standard labels
		if pol.Labels == nil {
			pol.Labels = make(map[string]string)
		}
		pol.Labels["uds/package"] = pkgName
		pol.Labels["uds/generation"] = generation

		// Set owner references
		pol.OwnerReferences = ownerRefs

		// Add port 15008 (ztunnel HBONE) to all port-restricted rules
		addZtunnelPort(pol)
	}

	// Apply all policies using server-side apply (patch)
	for _, pol := range policies {
		data, err := json.Marshal(pol)
		if err != nil {
			return 0, fmt.Errorf("marshal network policy %s: %w", pol.Name, err)
		}
		_, err = netClient.NetworkPolicies(namespace).Patch(ctx, pol.Name, types.ApplyPatchType, data, metav1.PatchOptions{
			FieldManager: "uds-controller",
			Force:        boolPtr(true),
		})
		if err != nil {
			return 0, fmt.Errorf("apply network policy %s: %w", pol.Name, err)
		}
		slog.Debug("Applied NetworkPolicy", "name", pol.Name, "namespace", namespace)
	}

	// Purge orphaned policies from previous generations
	if err := purgeOrphans(ctx, netClient, namespace, pkgName, generation); err != nil {
		slog.Error("Failed to purge orphaned network policies", "error", err)
	}

	return len(policies), nil
}

func purgeOrphans(ctx context.Context, netClient networkingv1client.NetworkingV1Interface, namespace, pkgName, generation string) error {
	list, err := netClient.NetworkPolicies(namespace).List(ctx, metav1.ListOptions{
		LabelSelector: fmt.Sprintf("uds/package=%s", pkgName),
	})
	if err != nil {
		return err
	}

	for _, pol := range list.Items {
		genLabel := pol.Labels["uds/generation"]
		if genLabel != generation {
			slog.Debug("Deleting orphaned NetworkPolicy", "name", pol.Name, "namespace", namespace)
			if err := netClient.NetworkPolicies(namespace).Delete(ctx, pol.Name, metav1.DeleteOptions{}); err != nil {
				slog.Error("Failed to delete orphan", "name", pol.Name, "error", err)
			}
		}
	}
	return nil
}

// --- Default policies ---

func defaultDenyAll(namespace string) *networkingv1.NetworkPolicy {
	return &networkingv1.NetworkPolicy{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "default",
			Namespace: namespace,
		},
		Spec: networkingv1.NetworkPolicySpec{
			PodSelector: metav1.LabelSelector{},
			PolicyTypes: []networkingv1.PolicyType{
				networkingv1.PolicyTypeIngress,
				networkingv1.PolicyTypeEgress,
			},
			Ingress: []networkingv1.NetworkPolicyIngressRule{},
			Egress:  []networkingv1.NetworkPolicyEgressRule{},
		},
	}
}

func dnsEgress(namespace string) *networkingv1.NetworkPolicy {
	udpProto := corev1.ProtocolUDP
	port53 := intstr.FromInt32(53)
	return &networkingv1.NetworkPolicy{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "egress-all-pods-kube-system-kube-dns-53",
			Namespace: namespace,
			Annotations: map[string]string{
				"uds/description": "DNS lookup via CoreDNS",
			},
		},
		Spec: networkingv1.NetworkPolicySpec{
			PodSelector: metav1.LabelSelector{},
			PolicyTypes: []networkingv1.PolicyType{networkingv1.PolicyTypeEgress},
			Egress: []networkingv1.NetworkPolicyEgressRule{
				{
					To: []networkingv1.NetworkPolicyPeer{
						{
							NamespaceSelector: &metav1.LabelSelector{
								MatchLabels: map[string]string{"kubernetes.io/metadata.name": "kube-system"},
							},
							PodSelector: &metav1.LabelSelector{
								MatchLabels: map[string]string{"k8s-app": "kube-dns"},
							},
						},
					},
					Ports: []networkingv1.NetworkPolicyPort{
						{Port: &port53, Protocol: &udpProto},
					},
				},
			},
		},
	}
}

func istiodEgress(namespace string) *networkingv1.NetworkPolicy {
	port15012 := intstr.FromInt32(15012)
	return &networkingv1.NetworkPolicy{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "egress-all-pods-istio-system-pilot-15012",
			Namespace: namespace,
			Annotations: map[string]string{
				"uds/description": "Istiod communication",
			},
		},
		Spec: networkingv1.NetworkPolicySpec{
			PodSelector: metav1.LabelSelector{},
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
					Ports: []networkingv1.NetworkPolicyPort{
						{Port: &port15012},
					},
				},
			},
		},
	}
}

func sidecarMonitoring(namespace string) *networkingv1.NetworkPolicy {
	port15020 := intstr.FromInt32(15020)
	return &networkingv1.NetworkPolicy{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "ingress-all-pods-monitoring-prometheus-15020",
			Namespace: namespace,
			Annotations: map[string]string{
				"uds/description": "Sidecar monitoring",
			},
		},
		Spec: networkingv1.NetworkPolicySpec{
			PodSelector: metav1.LabelSelector{},
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
					Ports: []networkingv1.NetworkPolicyPort{
						{Port: &port15020},
					},
				},
			},
		},
	}
}

func ambientHealthProbes(namespace string) *networkingv1.NetworkPolicy {
	return &networkingv1.NetworkPolicy{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "ingress-all-pods-169-254-7-127-32",
			Namespace: namespace,
			Annotations: map[string]string{
				"uds/description": "Ambient Healthprobes",
			},
		},
		Spec: networkingv1.NetworkPolicySpec{
			PodSelector: metav1.LabelSelector{},
			PolicyTypes: []networkingv1.PolicyType{networkingv1.PolicyTypeIngress},
			Ingress: []networkingv1.NetworkPolicyIngressRule{
				{
					From: []networkingv1.NetworkPolicyPeer{
						{
							IPBlock: &networkingv1.IPBlock{
								CIDR: "169.254.7.127/32",
							},
						},
					},
				},
			},
		},
	}
}

// --- Custom policy generators ---

func generatePolicy(namespace string, allow udstypes.Allow, istioMode udstypes.Mode) *networkingv1.NetworkPolicy {
	name := generateName(allow)

	pol := &networkingv1.NetworkPolicy{
		ObjectMeta: metav1.ObjectMeta{
			Name:      name,
			Namespace: namespace,
			Labels:    make(map[string]string),
		},
		Spec: networkingv1.NetworkPolicySpec{
			PodSelector: metav1.LabelSelector{
				MatchLabels: mergeSelectors(allow.Selector, allow.PodLabels),
			},
			PolicyTypes: []networkingv1.PolicyType{networkingv1.PolicyType(allow.Direction)},
		},
	}

	if allow.Description != nil {
		pol.Annotations = map[string]string{"uds/description": *allow.Description}
	}
	if allow.RemoteGenerated != nil {
		pol.Labels["uds/generated"] = string(*allow.RemoteGenerated)
	}
	if len(allow.Labels) > 0 {
		for k, v := range allow.Labels {
			pol.Labels[k] = v
		}
	}

	peers := buildPeers(allow, istioMode)
	ports := buildPorts(allow)

	switch allow.Direction {
	case udstypes.Ingress:
		pol.Spec.Ingress = []networkingv1.NetworkPolicyIngressRule{
			{From: peers, Ports: ports},
		}
	case udstypes.Egress:
		pol.Spec.Egress = []networkingv1.NetworkPolicyEgressRule{
			{To: peers, Ports: ports},
		}
	}

	return pol
}

func generateExposePolicy(namespace string, expose udstypes.Expose, pkg *udstypes.UDSPackage, istioMode udstypes.Mode) *networkingv1.NetworkPolicy {
	gateway := utils.DerefString(expose.Gateway)
	if gateway == "" {
		gateway = "tenant"
	}
	gateway = strings.ToLower(gateway)

	port := int32(443)
	if expose.Port != nil {
		port = int32(*expose.Port)
	}
	if expose.TargetPort != nil {
		port = int32(*expose.TargetPort)
	}

	appSelector := mergeSelectors(expose.Selector, expose.PodLabels)
	// In ambient mode, redirect ingress to the waypoint pod if the selector matches an authservice client
	selector := appSelector
	if waypointName := findMatchingWaypoint(pkg, appSelector, istioMode); waypointName != "" {
		selector = waypointSelector(waypointName)
	}

	desc := fmt.Sprintf("%d-%s Istio %s gateway", port, joinMapValues(appSelector), gateway)
	portVal := intstr.FromInt32(port)

	return &networkingv1.NetworkPolicy{
		ObjectMeta: metav1.ObjectMeta{
			Name:      utils.SanitizeResourceName(desc),
			Namespace: namespace,
			Annotations: map[string]string{
				"uds/description": desc,
			},
			Labels: make(map[string]string),
		},
		Spec: networkingv1.NetworkPolicySpec{
			PodSelector: metav1.LabelSelector{
				MatchLabels: selector,
			},
			PolicyTypes: []networkingv1.PolicyType{networkingv1.PolicyTypeIngress},
			Ingress: []networkingv1.NetworkPolicyIngressRule{
				{
					From: []networkingv1.NetworkPolicyPeer{
						{
							NamespaceSelector: &metav1.LabelSelector{
								MatchLabels: map[string]string{"kubernetes.io/metadata.name": fmt.Sprintf("istio-%s-gateway", gateway)},
							},
							PodSelector: &metav1.LabelSelector{
								MatchLabels: map[string]string{"app": fmt.Sprintf("%s-ingressgateway", gateway)},
							},
						},
					},
					Ports: []networkingv1.NetworkPolicyPort{
						{Port: &portVal},
					},
				},
			},
		},
	}
}

func generateMonitorPolicy(namespace string, monitor udstypes.Monitor, pkg *udstypes.UDSPackage, istioMode udstypes.Mode) *networkingv1.NetworkPolicy {
	port := intstr.FromInt32(int32(monitor.TargetPort))
	selector := mergeSelectors(monitor.PodSelector, monitor.Selector)
	// In ambient mode, redirect to waypoint pod if this monitor selector matches an authservice client
	if waypointName := findMatchingWaypoint(pkg, selector, istioMode); waypointName != "" {
		selector = waypointSelector(waypointName)
	}
	desc := fmt.Sprintf("%d-%s Metrics", int32(monitor.TargetPort), joinMapValues(mergeSelectors(monitor.PodSelector, monitor.Selector)))

	return &networkingv1.NetworkPolicy{
		ObjectMeta: metav1.ObjectMeta{
			Name:      utils.SanitizeResourceName(desc),
			Namespace: namespace,
			Annotations: map[string]string{
				"uds/description": desc,
			},
			Labels: make(map[string]string),
		},
		Spec: networkingv1.NetworkPolicySpec{
			PodSelector: metav1.LabelSelector{
				MatchLabels: selector,
			},
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
					Ports: []networkingv1.NetworkPolicyPort{
						{Port: &port},
					},
				},
			},
		},
	}
}

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
	if istioMode != udstypes.Ambient || len(selector) == 0 {
		return ""
	}
	for _, sso := range pkg.Spec.Sso {
		if len(sso.EnableAuthserviceSelector) == 0 {
			continue
		}
		if labelsMatchAll(selector, sso.EnableAuthserviceSelector) {
			return sanitizeID(sso.ClientID) + waypointSuffix
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

// --- Helpers ---

func generateName(allow udstypes.Allow) string {
	if allow.Description != nil && *allow.Description != "" {
		return fmt.Sprintf("%s-%s", allow.Direction, *allow.Description)
	}

	parts := []string{string(allow.Direction)}
	sel := mergeSelectors(allow.Selector, allow.PodLabels)
	if len(sel) > 0 {
		parts = append(parts, joinMapValues(sel))
	} else {
		parts = append(parts, "all pods")
	}

	if allow.RemoteGenerated != nil {
		parts = append(parts, string(*allow.RemoteGenerated))
	} else {
		if allow.RemoteNamespace != nil {
			parts = append(parts, *allow.RemoteNamespace)
		}
		remoteSel := mergeSelectors(allow.RemoteSelector, allow.RemotePodLabels)
		if len(remoteSel) > 0 {
			parts = append(parts, joinMapValues(remoteSel))
		} else {
			parts = append(parts, "all pods")
		}
	}

	return strings.Join(parts, "-")
}

func buildPeers(allow udstypes.Allow, istioMode udstypes.Mode) []networkingv1.NetworkPolicyPeer {
	var peers []networkingv1.NetworkPolicyPeer

	if allow.RemoteGenerated != nil {
		switch *allow.RemoteGenerated {
		case udstypes.Anywhere:
			peers = append(peers, networkingv1.NetworkPolicyPeer{
				IPBlock: &networkingv1.IPBlock{
					CIDR:   "0.0.0.0/0",
					Except: []string{"169.254.169.254/32"},
				},
			})
		case udstypes.CloudMetadata:
			peers = append(peers, networkingv1.NetworkPolicyPeer{
				IPBlock: &networkingv1.IPBlock{CIDR: "169.254.169.254/32"},
			})
		case udstypes.IntraNamespace:
			peers = append(peers, networkingv1.NetworkPolicyPeer{
				PodSelector: &metav1.LabelSelector{},
			})
		case udstypes.KubeAPI:
			cfg := config.Get()
			if cfg.KubeApiCIDR != "" {
				peers = append(peers, networkingv1.NetworkPolicyPeer{
					IPBlock: &networkingv1.IPBlock{CIDR: cfg.KubeApiCIDR},
				})
			} else {
				// Fallback: allow all IPs (will be refined when EndpointSlice watcher is added)
				peers = append(peers, networkingv1.NetworkPolicyPeer{
					IPBlock: &networkingv1.IPBlock{CIDR: "0.0.0.0/0"},
				})
			}
		case udstypes.KubeNodes:
			cfg := config.Get()
			if len(cfg.KubeNodeCIDRs) > 0 {
				for _, cidr := range cfg.KubeNodeCIDRs {
					peers = append(peers, networkingv1.NetworkPolicyPeer{
						IPBlock: &networkingv1.IPBlock{CIDR: cidr},
					})
				}
			} else {
				peers = append(peers, networkingv1.NetworkPolicyPeer{
					IPBlock: &networkingv1.IPBlock{CIDR: "0.0.0.0/0"},
				})
			}
		}
		return peers
	}

	if allow.RemoteCIDR != nil {
		peers = append(peers, networkingv1.NetworkPolicyPeer{
			IPBlock: &networkingv1.IPBlock{CIDR: *allow.RemoteCIDR},
		})
		return peers
	}

	// Namespace + pod selector based peer
	peer := networkingv1.NetworkPolicyPeer{}
	if allow.RemoteNamespace != nil {
		ns := *allow.RemoteNamespace
		if ns == "*" || ns == "" {
			peer.NamespaceSelector = &metav1.LabelSelector{}
		} else {
			peer.NamespaceSelector = &metav1.LabelSelector{
				MatchLabels: map[string]string{"kubernetes.io/metadata.name": ns},
			}
		}
	}

	remoteSel := mergeSelectors(allow.RemoteSelector, allow.RemotePodLabels)
	if len(remoteSel) > 0 {
		peer.PodSelector = &metav1.LabelSelector{MatchLabels: remoteSel}
	}

	if peer.NamespaceSelector != nil || peer.PodSelector != nil {
		peers = append(peers, peer)
	}

	return peers
}

func buildPorts(allow udstypes.Allow) []networkingv1.NetworkPolicyPort {
	var ports []networkingv1.NetworkPolicyPort
	if allow.Port != nil {
		p := intstr.FromInt32(int32(*allow.Port))
		ports = append(ports, networkingv1.NetworkPolicyPort{Port: &p})
	}
	for _, port := range allow.Ports {
		p := intstr.FromInt32(int32(port))
		ports = append(ports, networkingv1.NetworkPolicyPort{Port: &p})
	}
	return ports
}

func addZtunnelPort(pol *networkingv1.NetworkPolicy) {
	port15008 := intstr.FromInt32(15008)
	udpProto := corev1.ProtocolUDP

	for i := range pol.Spec.Ingress {
		rule := &pol.Spec.Ingress[i]
		if len(rule.Ports) > 0 && !allUDP(rule.Ports) {
			rule.Ports = append(rule.Ports, networkingv1.NetworkPolicyPort{Port: &port15008})
		}
	}

	for i := range pol.Spec.Egress {
		rule := &pol.Spec.Egress[i]
		if len(rule.Ports) > 0 && !allUDP(rule.Ports) {
			// Skip ztunnel port for KubeNodes, KubeAPI, CloudMetadata
			genLabel := pol.Labels["uds/generated"]
			if genLabel == string(udstypes.KubeNodes) || genLabel == string(udstypes.KubeAPI) || genLabel == string(udstypes.CloudMetadata) {
				continue
			}
			rule.Ports = append(rule.Ports, networkingv1.NetworkPolicyPort{Port: &port15008})
		}
	}

	_ = udpProto // referenced in allUDP
}

func allUDP(ports []networkingv1.NetworkPolicyPort) bool {
	for _, p := range ports {
		if p.Protocol == nil || *p.Protocol != corev1.ProtocolUDP {
			return false
		}
	}
	return len(ports) > 0
}

func mergeSelectors(primary, deprecated map[string]string) map[string]string {
	if len(primary) > 0 {
		return primary
	}
	return deprecated
}

func joinMapValues(m map[string]string) string {
	if len(m) == 0 {
		return "all pods"
	}
	vals := make([]string, 0, len(m))
	// Sort keys for deterministic output
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	for _, k := range keys {
		vals = append(vals, m[k])
	}
	return strings.Join(vals, "-")
}

func boolPtr(b bool) *bool { return &b }
