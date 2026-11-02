// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package controller

import (
	"context"
	coordinationv1 "k8s.io/api/coordination/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes/fake"
	"k8s.io/client-go/rest"
	"k8s.io/utils/ptr"
	"testing"
	"time"
)

func TestLeadershipLossDrainsWorkersWithoutCancelingAdmission(t *testing.T) {
	process, cancel := context.WithCancel(context.Background())
	defer cancel()
	entered, drained := make(chan struct{}), make(chan struct{})
	epoch := newLeaderEpoch(process, func(ctx context.Context) { close(entered); <-ctx.Done(); close(drained) })
	lease, lose := context.WithCancel(process)
	go epoch.start(lease)
	<-entered
	lose()
	epoch.stop()
	select {
	case <-drained:
	default:
		t.Fatal("worker outlived epoch")
	}
	if process.Err() != nil {
		t.Fatal("admission process canceled on lease loss")
	}
	next := newLeaderEpoch(process, func(ctx context.Context) { <-ctx.Done() })
	go next.start(process)
	next.stop()
}
func TestStoppedEpochNeverStartsLateCallback(t *testing.T) {
	epoch := newLeaderEpoch(context.Background(), func(context.Context) { t.Error("late writer started") })
	epoch.stop()
	epoch.start(context.Background())
}
func TestLeaseReleasePreservesReplacementLeader(t *testing.T) {
	ctx := context.Background()
	client := fake.NewClientset(&coordinationv1.Lease{ObjectMeta: metav1.ObjectMeta{Name: "uds-native-controller", Namespace: "uds-system"}, Spec: coordinationv1.LeaseSpec{HolderIdentity: ptr.To("replacement")}})
	if err := releaseLeadership(ctx, client.CoordinationV1(), "uds-system", "old"); err != nil {
		t.Fatal(err)
	}
	lease, _ := client.CoordinationV1().Leases("uds-system").Get(ctx, "uds-native-controller", metav1.GetOptions{})
	if *lease.Spec.HolderIdentity != "replacement" {
		t.Fatal("released replacement")
	}
	if err := releaseLeadership(ctx, client.CoordinationV1(), "uds-system", "replacement"); err != nil {
		t.Fatal(err)
	}
	lease, _ = client.CoordinationV1().Leases("uds-system").Get(ctx, "uds-native-controller", metav1.GetOptions{})
	if *lease.Spec.HolderIdentity != "" {
		t.Fatal("did not release drained leader")
	}
}
func TestAdmissionBudgetIndependent(t *testing.T) {
	base := controllerClientConfig(&rest.Config{})
	serving := admissionClientConfig(base)
	if serving.RateLimiter == base.RateLimiter || serving.Timeout != 10*time.Second {
		t.Fatal("shared/unbounded admission client")
	}
	for base.RateLimiter.TryAccept() {
	}
	if !serving.RateLimiter.TryAccept() {
		t.Fatal("admission starved")
	}
}
