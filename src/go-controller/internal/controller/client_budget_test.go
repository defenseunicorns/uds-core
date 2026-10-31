// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
package controller

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/util/flowcontrol"
)

var mapsGVR = schema.GroupVersionResource{Version: "v1", Resource: "configmaps"}

func fixtureServer(t *testing.T, calls *atomic.Int32) *httptest.Server {
	t.Helper()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		w.Header().Set("Content-Type", "application/json")
		if r.URL.Query().Get("labelSelector") == "deny=true" {
			w.WriteHeader(http.StatusForbidden)
			_, _ = w.Write([]byte(`{"apiVersion":"v1","kind":"Status","status":"Failure","reason":"Forbidden","code":403}`))
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]interface{}{"apiVersion": "v1", "kind": "ConfigMapList", "metadata": map[string]interface{}{}, "items": []interface{}{}})
	}))
	t.Cleanup(server.Close)
	return server
}
func newClient(t *testing.T, cfg *rest.Config) dynamic.Interface {
	t.Helper()
	c, e := dynamic.NewForConfig(cfg)
	if e != nil {
		t.Fatal(e)
	}
	return c
}
func TestBudgetCopiesConfigAndHonorsExplicitOverrides(t *testing.T) {
	base := &rest.Config{Host: "http://127.0.0.1"}
	a := controllerClientConfig(base)
	if base.QPS != 0 || base.Burst != 0 || base.RateLimiter != nil {
		t.Fatal("caller config was mutated")
	}
	if a.QPS != 20 || a.Burst != 40 || a.RateLimiter == nil {
		t.Fatal("bounded defaults absent")
	}
	explicit := &rest.Config{QPS: 7, Burst: 9, RateLimiter: flowcontrol.NewTokenBucketRateLimiter(7, 9)}
	copied := controllerClientConfig(explicit)
	if copied.QPS != 7 || copied.Burst != 9 || copied.RateLimiter != explicit.RateLimiter {
		t.Fatal("explicit caller budget replaced")
	}
	disabled := &rest.Config{QPS: -1}
	if copied := controllerClientConfig(disabled); copied.QPS != -1 || copied.Burst != 0 || copied.RateLimiter != nil {
		t.Fatal("explicit rate-limit disable override replaced")
	}
	invalid := &rest.Config{QPS: 7, Burst: -1}
	if copied := controllerClientConfig(invalid); copied.Burst != -1 || copied.RateLimiter != nil {
		t.Fatal("invalid explicit burst hidden")
	}
}
func TestAllClientsShareOneAggregateBudget(t *testing.T) {
	var calls atomic.Int32
	server := fixtureServer(t, &calls)
	cfg := controllerClientConfig(&rest.Config{Host: server.URL})
	clients := []dynamic.Interface{newClient(t, cfg), newClient(t, cfg), newClient(t, cfg)}
	// Consume the burst before measuring steady state; three separate limiters
	// would each have another independent burst and bypass the aggregate bound.
	for cfg.RateLimiter.TryAccept() {
	}
	begin := time.Now()
	for i := 0; i < 12; i++ {
		if _, e := clients[i%3].Resource(mapsGVR).Namespace("fixture").List(context.Background(), metav1.ListOptions{}); e != nil {
			t.Fatal(e)
		}
	}
	elapsed := time.Since(begin)
	if calls.Load() != 12 || elapsed < 500*time.Millisecond || elapsed > 2*time.Second {
		t.Fatalf("aggregate budget failed: %d calls in %s", calls.Load(), elapsed)
	}
}
func TestBudgetRetainsAuthorizationFailureAndCancellation(t *testing.T) {
	var calls atomic.Int32
	server := fixtureServer(t, &calls)
	cfg := controllerClientConfig(&rest.Config{Host: server.URL})
	client := newClient(t, cfg)
	_, err := client.Resource(mapsGVR).Namespace("fixture").List(context.Background(), metav1.ListOptions{LabelSelector: "deny=true"})
	if !apierrors.IsForbidden(err) {
		t.Fatalf("authorization failure hidden: %v", err)
	}
	for cfg.RateLimiter.TryAccept() {
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	_, err = client.Resource(mapsGVR).Namespace("fixture").List(ctx, metav1.ListOptions{})
	if !errors.Is(err, context.Canceled) || calls.Load() != 1 {
		t.Fatalf("cancelled request sent or error lost: %d / %v", calls.Load(), err)
	}
}
func TestSteadyStateRequestCountAndThrottleComparison(t *testing.T) {
	var durations [2]time.Duration
	for index, mode := range []string{"current-default-5qps", "proposed-shared-20qps"} {
		var calls atomic.Int32
		server := fixtureServer(t, &calls)
		cfg := &rest.Config{Host: server.URL}
		if index == 1 {
			cfg = controllerClientConfig(cfg)
		}
		client := newClient(t, cfg)
		begin := time.Now()
		for i := 0; i < 60; i++ {
			_, err := client.Resource(mapsGVR).Namespace("fixture").List(context.Background(), metav1.ListOptions{})
			if err != nil {
				t.Fatal(err)
			}
		}
		durations[index] = time.Since(begin)
		if calls.Load() != 60 {
			t.Fatal("optimization omitted an authoritative API request")
		}
		t.Logf("%s: exactly60sameGET/LIST requests, elapsed=%s", mode, durations[index])
	}
	if durations[1] >= durations[0]/2 {
		t.Fatalf("no measured throttle reduction: %v", durations)
	}
}
