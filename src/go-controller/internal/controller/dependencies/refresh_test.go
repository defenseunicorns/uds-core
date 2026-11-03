// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
package dependencies

import (
	"context"
	"fmt"
	"reflect"
	"testing"
	"time"

	"github.com/defenseunicorns/uds-core/src/go-controller/internal/config"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes/fake"
)

func TestDiscoveryBurstCoalescesAndIgnoresUnrelatedInputs(t *testing.T) {
	saved := config.Get()
	t.Cleanup(func() { config.Update(func(c *config.Config) { *c = saved }) })
	events := &packageEvents{}
	c := New(fake.NewClientset(), NewInputs(fake.NewClientset()), events)
	defer c.queue.ShutDown()
	ctx, cancel := context.WithCancel(context.Background())
	done := c.StartDiscovery(ctx)
	defer func() { cancel(); <-done }()
	events.clear()
	// Populate the synchronized snapshot before delivering a burst of callbacks.
	for n := range 100 {
		node := &corev1.Node{ObjectMeta: metav1.ObjectMeta{Name: fmt.Sprint(n)}, Status: corev1.NodeStatus{Addresses: []corev1.NodeAddress{{Type: corev1.NodeInternalIP, Address: fmt.Sprintf("10.0.0.%d", n+1)}}}}
		if err := c.inputs.Nodes.GetStore().Add(node); err != nil {
			t.Fatal(err)
		}
	}
	for _, obj := range c.inputs.Nodes.GetStore().List() {
		c.changed(obj)
	}
	waitEvents(t, ctx, events)
	if got := events.snapshot(); !reflect.DeepEqual(got, []string{"all"}) {
		t.Fatalf("burst fanned out: %v", got)
	}
	if len(config.Get().DiscoveredNodeCIDRs) != 100 {
		t.Fatal("coalescing dropped a node address")
	}
	events.clear()
	for n := range 100 {
		c.changed(&corev1.Secret{ObjectMeta: metav1.ObjectMeta{Name: fmt.Sprint(n), Namespace: "tenant", Labels: map[string]string{"uds/package": "shared-forged"}}})
		c.changed(&corev1.Service{ObjectMeta: metav1.ObjectMeta{Name: fmt.Sprint(n), Namespace: "tenant"}})
	}
	c.discoveryMu.Lock()
	dirty := len(c.dirty)
	c.discoveryMu.Unlock()
	if dirty != 0 || len(events.snapshot()) != 0 {
		t.Fatal("unrelated data scheduled global discovery")
	}
}

func TestRefreshOnlyRecomputesChangedInputAndRevokesDeletedConfig(t *testing.T) {
	saved := config.Get()
	defer config.Update(func(c *config.Config) { *c = saved })
	config.Update(func(c *config.Config) {
		c.DiscoveredNodeCIDRs = []string{"10.2.3.4/32"}
		c.AllowPublicClients = true
		c.KeycloakClientMode = "SIGNED_JWT"
	})
	c := New(fake.NewClientset(), NewInputs(fake.NewClientset()), &packageEvents{})
	defer c.queue.ShutDown()
	// The node informer has no data here. A Secret refresh must not erase the
	// already synchronized node discovery, or recompute unrelated inputs.
	c.refresh(map[string]bool{"operator": true})
	got := config.Get()
	if got.AllowPublicClients || got.KeycloakClientMode != "CLIENT_SECRET" {
		t.Fatal("deleted operator Secret retained stale configuration")
	}
	if !reflect.DeepEqual(got.DiscoveredNodeCIDRs, []string{"10.2.3.4/32"}) {
		t.Fatal("Secret event recomputed node discovery")
	}
	ctx, cancel := context.WithCancel(context.Background())
	done := c.StartDiscovery(ctx)
	cancel()
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("replica-local discovery worker did not stop")
	}
}
