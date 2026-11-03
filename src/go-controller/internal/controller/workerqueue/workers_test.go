// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package workerqueue

import (
	"context"
	"k8s.io/client-go/util/workqueue"
	"testing"
	"time"
)

func TestQueueSurvivesLeadershipEpochs(t *testing.T) {
	q := workqueue.NewTypedRateLimitingQueue(workqueue.DefaultTypedControllerRateLimiter[string]())
	defer q.ShutDown()
	processed := make(chan string, 10)
	next := func(ctx context.Context) bool {
		k, stop := Get(ctx, q)
		if stop {
			return false
		}
		defer q.Done(k)
		processed <- k
		return true
	}
	for _, key := range []string{"first", "second"} {
		ctx, cancel := context.WithCancel(context.Background())
		done := make(chan struct{})
		q.Add(key)
		go func() { Run(ctx, q, 2, next); close(done) }()
		select {
		case got := <-processed:
			if got != key {
				t.Fatalf("got %q", got)
			}
		case <-time.After(time.Second):
			t.Fatal("queue did not resume")
		}
		cancel()
		select {
		case <-done:
		case <-time.After(time.Second):
			t.Fatal("idle workers did not stop")
		}
		if q.ShuttingDown() {
			t.Fatal("epoch destroyed queue")
		}
	}
}
