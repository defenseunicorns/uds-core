// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

// Package network creates and manages Kubernetes NetworkPolicies for UDS Packages.
package network

import (
	corev1 "k8s.io/api/core/v1"
	networkingv1 "k8s.io/api/networking/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	"k8s.io/apimachinery/pkg/util/intstr"
)

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
