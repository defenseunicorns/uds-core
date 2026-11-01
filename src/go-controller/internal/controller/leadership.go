// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package controller

import (
	"context"
	"fmt"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	coordinationclient "k8s.io/client-go/kubernetes/typed/coordination/v1"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/leaderelection"
	"k8s.io/client-go/tools/leaderelection/resourcelock"
	"k8s.io/client-go/util/flowcontrol"
	"log/slog"
	"os"
	"time"
)

// Webhook/cache serving runs in every replica. Only the Lease holder authors
// reconciliation state. Lease loss cancels the writer context and exits the
// process. Operations retain their API ownership/version guards: leader election
// alone does not fence writes that the API server already accepted.
func runLeader(ctx context.Context, client coordinationclient.CoordinationV1Interface, run func(context.Context)) error {
	identity := os.Getenv("HOSTNAME")
	if identity == "" {
		return fmt.Errorf("controller Pod identity is required")
	}
	namespace := os.Getenv("POD_NAMESPACE")
	if namespace == "" {
		namespace = "uds-system"
	}
	lock := &resourcelock.LeaseLock{LeaseMeta: metav1.ObjectMeta{Name: "uds-native-controller", Namespace: namespace}, Client: client, LockConfig: resourcelock.ResourceLockConfig{Identity: identity}}
	stopped := make(chan struct{})
	leadershipCtx, cancel := context.WithCancel(ctx)
	defer cancel()
	elector, err := leaderelection.NewLeaderElector(leaderelection.LeaderElectionConfig{
		Lock: lock, LeaseDuration: 15 * time.Second, RenewDeadline: 10 * time.Second, RetryPeriod: 2 * time.Second,
		ReleaseOnCancel: false, Name: "uds-native-controller",
		Callbacks: leaderelection.LeaderCallbacks{
			OnStartedLeading: func(leader context.Context) { run(leader) },
			OnStoppedLeading: func() { cancel(); close(stopped) },
			OnNewLeader:      func(id string) { slog.Info("Controller Lease owner", "identity", id) },
		},
	})
	if err != nil {
		return err
	}
	elector.Run(leadershipCtx)
	select {
	case <-ctx.Done():
		return nil
	case <-stopped:
		return fmt.Errorf("controller leadership lost")
	default:
		return nil
	}
}

func leadershipClientConfig(base *rest.Config) *rest.Config {
	// Reconciliation and informer bursts must not queue ahead of Lease renewal.
	// Bound this control traffic independently, below the 10-second renew deadline.
	cfg := rest.CopyConfig(base)
	cfg.QPS, cfg.Burst = 1, 2
	cfg.RateLimiter = flowcontrol.NewTokenBucketRateLimiter(cfg.QPS, cfg.Burst)
	cfg.Timeout = 5 * time.Second
	return cfg
}
