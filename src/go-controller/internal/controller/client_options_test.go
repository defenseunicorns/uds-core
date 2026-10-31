// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
package controller

import (
	"context"
	"encoding/json"
	"errors"
	"math"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/util/flowcontrol"

	udsclient "github.com/defenseunicorns/uds-core/src/go-controller/client/clientset/versioned"
)

func TestOperatorBudgetIsPositiveBoundedAndDefaultPreserved(t *testing.T) {
	defaults := DefaultRunOptions()
	if defaults.KubernetesAPIQPS != 20 || defaults.KubernetesAPIBurst != 40 {
		t.Fatal("production defaults changed")
	}
	for _, qps := range []float32{-1, 0, .5, 201, float32(math.NaN()), float32(math.Inf(1))} {
		if (RunOptions{KubernetesAPIQPS: qps, KubernetesAPIBurst: 40}).Validate() == nil {
			t.Fatalf("invalid operator QPS accepted: %v", qps)
		}
	}
	for _, burst := range []int{-1, 0, 401} {
		if (RunOptions{KubernetesAPIQPS: 20, KubernetesAPIBurst: burst}).Validate() == nil {
			t.Fatalf("invalid operator burst accepted: %v", burst)
		}
	}
	if err := (RunOptions{KubernetesAPIQPS: 200, KubernetesAPIBurst: 400}).Validate(); err != nil {
		t.Fatal(err)
	}
	if _, err := NewControllerWithOptions(context.Background(), RunOptions{}); err == nil || !strings.Contains(err.Error(), "QPS") {
		t.Fatal("invalid settings reached in-cluster credential setup")
	}
}

func TestOptionsRetainExplicitCallerBudgetAndCancellation(t *testing.T) {
	limiter := flowcontrol.NewTokenBucketRateLimiter(7, 9)
	base := &rest.Config{QPS: 7, Burst: 9, RateLimiter: limiter}
	config := optionsClientConfig(base, RunOptions{KubernetesAPIQPS: 100, KubernetesAPIBurst: 200})
	if config.QPS != 7 || config.Burst != 9 || config.RateLimiter != limiter || base.RateLimiter != limiter {
		t.Fatal("caller authority was replaced")
	}
	var calls atomic.Int32
	server := fixtureServer(t, &calls)
	config = optionsClientConfig(&rest.Config{Host: server.URL}, RunOptions{KubernetesAPIQPS: 100, KubernetesAPIBurst: 200})
	client := newClient(t, config)
	for config.RateLimiter.TryAccept() {
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	_, err := client.Resource(mapsGVR).Namespace("fixture").List(ctx, metav1.ListOptions{})
	if !errors.Is(err, context.Canceled) || calls.Load() != 0 {
		t.Fatalf("cancellation bypassed request budget: %v / %d", err, calls.Load())
	}
}

func TestHigherBudgetIsStillOneBoundAcrossAllRealClientKinds(t *testing.T) {
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		kind, version := "ConfigMapList", "v1"
		if strings.HasPrefix(r.URL.Path, "/apis/uds.dev/") {
			kind, version = "PackageList", "uds.dev/v1alpha1"
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"apiVersion": version, "kind": kind, "metadata": map[string]any{}, "items": []any{}})
	}))
	t.Cleanup(server.Close)
	config := optionsClientConfig(&rest.Config{Host: server.URL}, RunOptions{KubernetesAPIQPS: 100, KubernetesAPIBurst: 200})
	core, err := kubernetes.NewForConfig(config)
	if err != nil {
		t.Fatal(err)
	}
	dynamicClient, err := dynamic.NewForConfig(config)
	if err != nil {
		t.Fatal(err)
	}
	uds, err := udsclient.NewForConfig(config)
	if err != nil {
		t.Fatal(err)
	}
	for config.RateLimiter.TryAccept() {
	}
	start := time.Now()
	for i := 0; i < 24; i++ {
		switch i % 3 {
		case 0:
			_, err = core.CoreV1().ConfigMaps("fixture").List(context.Background(), metav1.ListOptions{})
		case 1:
			_, err = dynamicClient.Resource(mapsGVR).Namespace("fixture").List(context.Background(), metav1.ListOptions{})
		case 2:
			_, err = uds.UdsV1alpha1().UDSPackages("fixture").List(context.Background(), metav1.ListOptions{})
		}
		if err != nil {
			t.Fatal(err)
		}
	}
	elapsed := time.Since(start)
	if calls.Load() != 24 || elapsed < 180*time.Millisecond || elapsed > time.Second {
		t.Fatalf("higher budget bypasses shared bound or drops calls: %d / %s", calls.Load(), elapsed)
	}
}
