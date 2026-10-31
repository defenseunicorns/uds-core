// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
package envoygateway

import (
	udstypes "github.com/defenseunicorns/uds-core/src/go-controller/api/uds/v1alpha1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/utils/ptr"
	"testing"
)

func udpPackage(name, namespace string, port float64) *udstypes.UDSPackage {
	return &udstypes.UDSPackage{ObjectMeta: metav1.ObjectMeta{Name: name, Namespace: namespace}, Spec: udstypes.Spec{Network: &udstypes.Network{Expose: []udstypes.Expose{{Protocol: ptr.To(udstypes.ExposeUDP), Port: &port, Service: ptr.To("echo")}}}}}
}
func TestDefaultListenersRebuildAcrossNamespaceAndRemoval(t *testing.T) {
	a, b := udpPackage("a", "first", 7000), udpPackage("b", "second", 9000)
	listeners, err := defaultListeners([]*udstypes.UDSPackage{b, a})
	if err != nil || len(listeners) != 2 {
		t.Fatal(listeners, err)
	}
	if listeners[0].(map[string]interface{})["name"] != "udp-7000" {
		t.Fatal("listeners not deterministic")
	}
	now := metav1.Now()
	a.DeletionTimestamp = &now
	listeners, err = defaultListeners([]*udstypes.UDSPackage{a, b})
	if err != nil || len(listeners) != 1 {
		t.Fatal("deleted Package listener retained")
	}
	a.DeletionTimestamp = nil
	b.Spec.Network.Expose[0].Port = ptr.To(float64(7000))
	if _, err = defaultListeners([]*udstypes.UDSPackage{a, b}); err == nil {
		t.Fatal("two namespaces were granted the same UDP listener")
	}
}
