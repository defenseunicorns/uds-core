// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

// Package network creates and manages Kubernetes NetworkPolicies for UDS Packages.
package network

import (
	"fmt"

	"sort"
	"strings"

	corev1 "k8s.io/api/core/v1"
	networkingv1 "k8s.io/api/networking/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	"k8s.io/apimachinery/pkg/util/intstr"

	udstypes "github.com/defenseunicorns/uds-core/src/go-controller/api/uds/v1alpha1"
	"github.com/defenseunicorns/uds-core/src/go-controller/internal/config"
)

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

	protocol := "TCP"
	if allow.RemoteProtocol != nil && *allow.RemoteProtocol == udstypes.RemoteProtocolUDP {
		protocol = "UDP"
	}
	parts = append(parts, protocol)
	return strings.Join(parts, "-")
}

func buildPeers(allow udstypes.Allow, istioMode udstypes.Mode) []networkingv1.NetworkPolicyPeer {
	var peers []networkingv1.NetworkPolicyPeer
	if allow.RemoteHost != nil {
		ns, selector := "istio-egress-gateway", map[string]string{"app": "egressgateway"}
		if istioMode == udstypes.Ambient {
			ns = "istio-egress-ambient"
			selector = map[string]string{"gateway.networking.k8s.io/gateway-name": "egress-waypoint"}
		}
		return []networkingv1.NetworkPolicyPeer{{NamespaceSelector: &metav1.LabelSelector{MatchLabels: map[string]string{"kubernetes.io/metadata.name": ns}}, PodSelector: &metav1.LabelSelector{MatchLabels: selector}}}
	}

	if allow.RemoteGenerated != nil {
		switch *allow.RemoteGenerated {
		case udstypes.Anywhere:
			peers = append(peers, networkingv1.NetworkPolicyPeer{
				IPBlock: &networkingv1.IPBlock{
					CIDR:   "0.0.0.0/0",
					Except: []string{"169.254.169.254/32"},
				},
			})
			peers = append(peers, networkingv1.NetworkPolicyPeer{NamespaceSelector: &metav1.LabelSelector{}, PodSelector: &metav1.LabelSelector{}})
		case udstypes.CloudMetadata:
			peers = append(peers, networkingv1.NetworkPolicyPeer{
				IPBlock: &networkingv1.IPBlock{CIDR: "169.254.169.254/32"},
			})
		case udstypes.IntraNamespace:
			peers = append(peers, networkingv1.NetworkPolicyPeer{
				PodSelector: &metav1.LabelSelector{},
			})
		case udstypes.KubeAPI:
			for _, cidr := range config.Get().APICIDRs() {
				peers = append(peers, networkingv1.NetworkPolicyPeer{IPBlock: &networkingv1.IPBlock{CIDR: cidr}})
			}
			if len(peers) == 0 {
				peers = append(peers, networkingv1.NetworkPolicyPeer{IPBlock: &networkingv1.IPBlock{CIDR: "0.0.0.0/32"}})
			}
		case udstypes.KubeNodes:
			for _, cidr := range config.Get().NodeCIDRs() {
				peers = append(peers, networkingv1.NetworkPolicyPeer{IPBlock: &networkingv1.IPBlock{CIDR: cidr}})
			}
			if len(peers) == 0 {
				peers = append(peers, networkingv1.NetworkPolicyPeer{IPBlock: &networkingv1.IPBlock{CIDR: "0.0.0.0/32"}})
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
	protocol := corev1.ProtocolTCP
	if allow.RemoteProtocol != nil && *allow.RemoteProtocol == udstypes.RemoteProtocolUDP {
		protocol = corev1.ProtocolUDP
	}
	if allow.Port != nil {
		p := intstr.FromInt32(int32(*allow.Port))
		ports = append(ports, networkingv1.NetworkPolicyPort{Port: &p, Protocol: &protocol})
	}
	for _, port := range allow.Ports {
		p := intstr.FromInt32(int32(port))
		ports = append(ports, networkingv1.NetworkPolicyPort{Port: &p, Protocol: &protocol})
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
	if primary != nil {
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
