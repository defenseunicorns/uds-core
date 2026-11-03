// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
package network

import (
	"context"
	"encoding/json"
	"fmt"
	"testing"

	udstypes "github.com/defenseunicorns/uds-core/src/go-controller/api/uds/v1alpha1"
	"github.com/defenseunicorns/uds-core/src/go-controller/internal/config"
	networkingv1 "k8s.io/api/networking/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/client-go/kubernetes/fake"
	ktesting "k8s.io/client-go/testing"
	"k8s.io/utils/ptr"
)

func coreNetworkPackage() *udstypes.UDSPackage {
	return &udstypes.UDSPackage{ObjectMeta: metav1.ObjectMeta{Name: "uds-controller", Namespace: "uds-system", UID: "core-owner", Generation: 1},
		Spec: udstypes.Spec{Network: &udstypes.Network{Allow: []udstypes.Allow{{Direction: udstypes.Egress, Selector: map[string]string{"app": "uds-controller"}, RemoteGenerated: ptr.To(udstypes.KubeAPI), Description: ptr.To("Kubernetes API for controller reconciliation")}}}}}
}

func TestCoreWriterCannotIsolateItselfBeforeAPIEgressExists(t *testing.T) {
	prior := config.Get()
	t.Cleanup(func() { config.Replace(prior) })
	config.Replace(config.Config{DiscoveredAPICIDRs: []string{"198.51.100.4/32"}})
	client := fake.NewClientset()
	isolation, apiAllowed, writes := false, false, 0
	client.PrependReactor("*", "networkpolicies", func(action ktesting.Action) (bool, runtime.Object, error) {
		if isolation && !apiAllowed {
			return true, nil, fmt.Errorf("the selected writer lost its Kubernetes API connection")
		}
		patch, ok := action.(ktesting.PatchAction)
		if !ok {
			return false, nil, nil
		}
		var policy networkingv1.NetworkPolicy
		if err := json.Unmarshal(patch.GetPatch(), &policy); err != nil {
			t.Fatal(err)
		}
		writes++
		for _, rule := range policy.Spec.Egress {
			for _, peer := range rule.To {
				if peer.IPBlock != nil && peer.IPBlock.CIDR == "198.51.100.4/32" {
					apiAllowed = true
				}
			}
		}
		for _, kind := range policy.Spec.PolicyTypes {
			isolation = isolation || kind == networkingv1.PolicyTypeEgress
		}
		if writes == 1 && (!apiAllowed || len(policy.Spec.Egress[0].To) != 1) {
			t.Fatal("Core bootstrap did not preserve its exact declared API grant", policy.Spec)
		}
		return true, &policy, nil
	})
	count, err := Reconcile(context.Background(), client.NetworkingV1(), coreNetworkPackage(), "uds-system", udstypes.Ambient)
	if err != nil || count != writes || writes < 4 || !isolation || !apiAllowed {
		t.Fatal("Core networking failed to converge without losing writer connectivity", count, writes, err)
	}
}

func TestUnknownAPIAddressCannotStrandTheCoreWriter(t *testing.T) {
	prior := config.Get()
	t.Cleanup(func() { config.Replace(prior) })
	config.Replace(config.Config{})
	client := fake.NewClientset()
	if _, err := Reconcile(context.Background(), client.NetworkingV1(), coreNetworkPackage(), "uds-system", udstypes.Ambient); err == nil {
		t.Fatal("missing API discovery did not stop Core isolation")
	}
	for _, action := range client.Actions() {
		if action.GetVerb() != "get" && action.GetVerb() != "list" {
			t.Fatal("unknown API address allowed isolation side effects", action)
		}
	}
}
