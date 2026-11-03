// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

// Package workerqueue keeps informer queues alive across leadership epochs.
package workerqueue

import (
	"context"
	"fmt"
	"k8s.io/client-go/util/workqueue"
	"strings"
	"sync"
)

const stopPrefix = "\x00leadership-stop/"

// Get wakes on epoch cancellation without destroying pending or delayed work.
// Stop keys are private to this package and never reach a reconciler.
func Get(ctx context.Context, q workqueue.TypedRateLimitingInterface[string]) (string, bool) {
	for {
		if ctx.Err() != nil {
			return "", true
		}
		key, shutdown := q.Get()
		if shutdown {
			return "", true
		}
		if strings.HasPrefix(key, stopPrefix) {
			q.Done(key)
			continue
		}
		if ctx.Err() != nil {
			q.Add(key)
			q.Done(key)
			return "", true
		}
		return key, false
	}
}

// Run must not overlap another epoch on the same queue. The caller owns final
// ShutDown; cancellation only stops workers and retains work for the next leader.
func Run(ctx context.Context, q workqueue.TypedRateLimitingInterface[string], workers int, next func(context.Context) bool) {
	var wg sync.WaitGroup
	for range workers {
		wg.Go(func() {
			for next(ctx) {
			}
		})
	}
	<-ctx.Done()
	for i := range workers {
		q.Add(fmt.Sprintf("%s%d", stopPrefix, i))
	}
	wg.Wait()
}
