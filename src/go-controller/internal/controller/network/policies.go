// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

// Package network creates and manages Kubernetes NetworkPolicies for UDS Packages.
package network

import (
	"context"
	"encoding/json"
	"fmt"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	"log/slog"

	"strings"

	networkingv1 "k8s.io/api/networking/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/apimachinery/pkg/util/intstr"
	networkingv1client "k8s.io/client-go/kubernetes/typed/networking/v1"
	"k8s.io/utils/ptr"

	udstypes "github.com/defenseunicorns/uds-core/src/go-controller/api/uds/v1alpha1"
	"github.com/defenseunicorns/uds-core/src/go-controller/internal/resources"

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
			"description", ptr.Deref(allow.Description, ""),
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
		if expose.Protocol != nil && *expose.Protocol == udstypes.ExposeUDP {
			gateway := ptr.Deref(expose.Gateway, "envoy-default-gateway")
			if gateway == "" {
				gateway = "envoy-default-gateway"
			}
			port := expose.Port
			if expose.TargetPort != nil {
				port = expose.TargetPort
			}
			desc := fmt.Sprintf("%v-%s Envoy Gateway %s", ptr.Deref(port, 0), joinMapValues(expose.Selector), gateway)
			allow := udstypes.Allow{Direction: udstypes.Ingress, Selector: expose.Selector, RemoteNamespace: &gateway, RemoteSelector: map[string]string{"gateway.envoyproxy.io/owning-gateway-name": gateway, "gateway.envoyproxy.io/owning-gateway-namespace": gateway}, Port: port, RemoteProtocol: ptr.To(udstypes.RemoteProtocolUDP), Description: &desc}
			policies = append(policies, generatePolicy(namespace, allow, istioMode))
			continue
		}
		if expose.AdvancedHTTP != nil && expose.AdvancedHTTP.DirectResponse != nil {
			slog.Debug("Skipping expose with directResponse",
				"package", pkgName, "host", ptr.Deref(expose.Host, ""))
			continue
		}
		slog.Debug("Generating expose ingress policy",
			"package", pkgName, "host", ptr.Deref(expose.Host, ""),
			"gateway", ptr.Deref(expose.Gateway, ""),
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
		if sso.EnableAuthserviceSelector == nil {
			continue
		}
		waypointName := utils.WaypointName(sso.ClientID)
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
	desiredNames := map[string]bool{}
	for _, pol := range policies {
		desiredNames[pol.Name] = true
		existing, err := netClient.NetworkPolicies(namespace).Get(ctx, pol.Name, metav1.GetOptions{})
		if err != nil && !apierrors.IsNotFound(err) {
			return 0, err
		}
		if err == nil {
			for _, owner := range existing.OwnerReferences {
				if owner.Kind == "Package" && owner.UID != pkg.UID {
					return 0, fmt.Errorf("NetworkPolicy %s belongs to another Package UID", pol.Name)
				}
			}
			pol.ResourceVersion = existing.ResourceVersion
		}
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
	if err := purgeOrphans(ctx, netClient, namespace, pkgName, generation, pkg.UID, desiredNames); err != nil {
		return 0, err
	}

	return len(policies), nil
}

func purgeOrphans(ctx context.Context, netClient networkingv1client.NetworkingV1Interface, namespace, pkgName, generation string, packageUID types.UID, desiredNames ...map[string]bool) error {
	if packageUID == "" {
		return fmt.Errorf("cannot purge NetworkPolicies without Package UID")
	}
	list, err := netClient.NetworkPolicies(namespace).List(ctx, metav1.ListOptions{
		LabelSelector: fmt.Sprintf("uds/package=%s", pkgName),
	})
	if err != nil {
		return err
	}

	for _, pol := range list.Items {
		if !resources.OwnedByPackage(&pol, packageUID) {
			continue
		}
		genLabel := pol.Labels["uds/generation"]
		if genLabel != generation || (len(desiredNames) > 0 && !desiredNames[0][pol.Name]) {
			slog.Debug("Deleting orphaned NetworkPolicy", "name", pol.Name, "namespace", namespace)
			uid, version := pol.UID, pol.ResourceVersion
			if err := netClient.NetworkPolicies(namespace).Delete(ctx, pol.Name, metav1.DeleteOptions{Preconditions: &metav1.Preconditions{UID: &uid, ResourceVersion: &version}}); err != nil && !apierrors.IsNotFound(err) {
				return err
			}
		}
	}
	return nil
}

// --- Default policies ---

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
	gateway := ptr.Deref(expose.Gateway, "")
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
			Name:      string(udstypes.Ingress) + "-" + desc,
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
			Name:      string(udstypes.Ingress) + "-" + desc,
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

// --- Helpers ---
