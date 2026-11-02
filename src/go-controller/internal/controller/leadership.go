// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package controller

import (
	"context"
	"fmt"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	coordinationclient "k8s.io/client-go/kubernetes/typed/coordination/v1"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/leaderelection"
	"k8s.io/client-go/tools/leaderelection/resourcelock"
	"k8s.io/client-go/util/flowcontrol"
	"k8s.io/utils/ptr"
	"log/slog"
	"os"
	"sync"
	"time"
)

// Admission stays available while reconciliation stops and re-campaigns. Each
// epoch is drained before this replica may start writing again.
func runLeader(ctx context.Context, client coordinationclient.CoordinationV1Interface, run func(context.Context)) error {
	identity := os.Getenv("HOSTNAME")
	if identity == "" {
		return fmt.Errorf("controller Pod identity is required")
	}
	namespace := os.Getenv("POD_NAMESPACE")
	if namespace == "" {
		namespace = "uds-system"
	}
	for ctx.Err() == nil {
		lock := &resourcelock.LeaseLock{LeaseMeta: metav1.ObjectMeta{Name: "uds-native-controller", Namespace: namespace}, Client: client, LockConfig: resourcelock.ResourceLockConfig{Identity: identity}}
		epoch := newLeaderEpoch(ctx, run)
		elector, err := leaderelection.NewLeaderElector(leaderelection.LeaderElectionConfig{
			Lock: lock, LeaseDuration: 15 * time.Second, RenewDeadline: 10 * time.Second, RetryPeriod: 2 * time.Second,
			// client-go releases BEFORE OnStoppedLeading. Release explicitly after the
			// worker barrier instead; an early release could overlap two writers.
			ReleaseOnCancel: false, Name: "uds-native-controller",
			Callbacks: leaderelection.LeaderCallbacks{
				OnStartedLeading: epoch.start,
				OnStoppedLeading: epoch.stop,
				OnNewLeader:      func(id string) { slog.Info("Controller Lease owner", "identity", id) },
			},
		})
		if err != nil {
			epoch.stop()
			return err
		}
		elector.Run(ctx)
		epoch.stop()
		// Cleanup is bounded independently of process cancellation. UID/resourceVersion
		// and holder identity prevent releasing a replacement leader's Lease.
		releaseCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
		releaseErr := releaseLeadership(releaseCtx, client, namespace, identity)
		cancel()
		if releaseErr != nil {
			slog.Warn("Could not release drained controller Lease", "error", releaseErr)
		}
		if ctx.Err() != nil {
			return nil
		}
		slog.Warn("Controller leadership lost; admission remains available while campaigning")
		timer := time.NewTimer(2 * time.Second)
		select {
		case <-ctx.Done():
			timer.Stop()
			return nil
		case <-timer.C:
		}
	}
	return nil
}

type leaderEpoch struct {
	mu               sync.Mutex
	stopped, running bool
	ctx              context.Context
	cancel           context.CancelFunc
	done             chan struct{}
	run              func(context.Context)
}

func newLeaderEpoch(ctx context.Context, run func(context.Context)) *leaderEpoch {
	child, cancel := context.WithCancel(ctx)
	return &leaderEpoch{ctx: child, cancel: cancel, done: make(chan struct{}), run: run}
}
func (e *leaderEpoch) start(leaseCtx context.Context) {
	e.mu.Lock()
	if e.stopped {
		e.mu.Unlock()
		return
	}
	e.running = true
	e.mu.Unlock()
	defer close(e.done)
	stop := context.AfterFunc(leaseCtx, e.cancel)
	defer stop()
	e.run(e.ctx)
}
func (e *leaderEpoch) stop() {
	e.mu.Lock()
	e.stopped = true
	e.cancel()
	running := e.running
	e.mu.Unlock()
	if running {
		<-e.done
	}
}
func releaseLeadership(ctx context.Context, client coordinationclient.CoordinationV1Interface, namespace, identity string) error {
	leases := client.Leases(namespace)
	lease, err := leases.Get(ctx, "uds-native-controller", metav1.GetOptions{})
	if apierrors.IsNotFound(err) {
		return nil
	}
	if err != nil {
		return err
	}
	if lease.Spec.HolderIdentity == nil || *lease.Spec.HolderIdentity != identity {
		return nil
	}
	lease.Spec.HolderIdentity = ptr.To("")
	lease.Spec.LeaseDurationSeconds = ptr.To(int32(1))
	_, err = leases.Update(ctx, lease, metav1.UpdateOptions{})
	return err
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
