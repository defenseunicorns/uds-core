// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
package network

import (
	udstypes "github.com/defenseunicorns/uds-core/src/go-controller/api/uds/v1alpha1"
	"github.com/defenseunicorns/uds-core/src/go-controller/internal/config"
	corev1 "k8s.io/api/core/v1"
	"k8s.io/utils/ptr"
	"testing"
)

func TestUDPPoliciesKeepProtocolAndExcludeHBONE(t *testing.T) {
	allow := udstypes.Allow{Direction: udstypes.Egress, RemoteGenerated: ptr.To(udstypes.Anywhere), RemoteProtocol: ptr.To(udstypes.RemoteProtocolUDP), Port: ptr.To(float64(53))}
	policy := generatePolicy("apps", allow, udstypes.Ambient)
	addZtunnelPort(policy)
	ports := policy.Spec.Egress[0].Ports
	if len(ports) != 1 || ports[0].Protocol == nil || *ports[0].Protocol != corev1.ProtocolUDP {
		t.Fatalf("UDP policy incorrectly broadened: %#v", ports)
	}
	allow.RemoteProtocol = ptr.To(udstypes.RemoteProtocolTCP)
	if generateName(allow) == generateName(udstypes.Allow{Direction: udstypes.Egress, RemoteGenerated: ptr.To(udstypes.Anywhere), RemoteProtocol: ptr.To(udstypes.RemoteProtocolUDP), Port: ptr.To(float64(53))}) {
		t.Fatal("TCP and UDP overwrite each other's policy")
	}
}
func TestExternalHostTargetsEgressProxy(t *testing.T) {
	allow := udstypes.Allow{Direction: udstypes.Egress, RemoteHost: ptr.To("example.com")}
	for _, mode := range []udstypes.Mode{udstypes.Ambient, udstypes.Sidecar} {
		peers := buildPeers(allow, mode)
		if len(peers) != 1 || peers[0].PodSelector == nil || peers[0].NamespaceSelector == nil || peers[0].IPBlock != nil {
			t.Fatalf("host egress bypasses managed proxy: %#v", peers)
		}
	}
}
func TestKubeDiscoveryDoesNotGrantAllAddresses(t *testing.T) {
	previous := config.Get()
	t.Cleanup(func() { config.Replace(previous) })
	config.Replace(config.Config{})
	for _, remote := range []udstypes.RemoteGenerated{udstypes.KubeAPI, udstypes.KubeNodes} {
		peers := buildPeers(udstypes.Allow{RemoteGenerated: &remote}, udstypes.Ambient)
		for _, peer := range peers {
			if peer.IPBlock != nil && peer.IPBlock.CIDR == "0.0.0.0/0" {
				t.Fatal("discovery failure silently allowed every IP")
			}
		}
	}
}
