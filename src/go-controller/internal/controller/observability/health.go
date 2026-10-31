// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
package observability

import (
	"context"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"sync/atomic"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/client-go/tools/cache"
)

type Sources struct {
	CachesReady        func() bool
	ServingReady       func() bool
	CallbacksReady     func() bool
	SnapshotCurrent    func(string) bool
	Parameters         cache.Store
	ValidatingPolicies cache.Store
	MutatingPolicies   cache.Store
	ValidatingBindings cache.Store
	MutatingBindings   cache.Store
}

// Health reports observed capability, never the existence of a Pepr process.
// Each replica serves admission; only the currently active Lease holder writes.
type Health struct {
	sources                           Sources
	leader                            atomic.Bool
	authority                         atomic.Pointer[leaderAuthority]
	registry                          *prometheus.Registry
	admission, reconciliation, native *prometheus.Desc
	contract                          []nativeExpectation
}
type leaderAuthority struct{ ctx context.Context }

func New(sources Sources) *Health {
	h := &Health{sources: sources, registry: prometheus.NewRegistry()}
	var err error
	h.contract, err = expectedNativeContract()
	if err != nil {
		slog.Error("Native capability contract unavailable; enforcement health remains false", "error", err)
	}
	labels := prometheus.Labels{"implementation": "go-native"}
	h.admission = prometheus.NewDesc("uds_native_admission_ready", "Actual live admission listener, synchronized trust/cache and complete callback registration readiness", nil, labels)
	h.reconciliation = prometheus.NewDesc("uds_native_reconciliation_ready", "This replica has active writing authority and synchronized required caches", nil, labels)
	h.native = prometheus.NewDesc("uds_native_policies_active", "Exact native policy definitions, current validation type checking, enforcing binding scopes, and the protected compiler snapshot are observed", nil, labels)
	h.registry.MustRegister(h)
	return h
}

func (h *Health) Leader(active bool) { h.leader.Store(active) }
func (h *Health) Leadership(ctx context.Context) {
	h.authority.Store(&leaderAuthority{ctx: ctx})
	h.leader.Store(true)
}
func (h *Health) Describe(ch chan<- *prometheus.Desc) {
	ch <- h.admission
	ch <- h.reconciliation
	ch <- h.native
}
func (h *Health) Collect(ch chan<- prometheus.Metric) {
	cacheReady := h.sources.CachesReady != nil && h.sources.CachesReady()
	serving := h.sources.ServingReady != nil && h.sources.ServingReady()
	registered := h.sources.CallbacksReady != nil && h.sources.CallbacksReady()
	ch <- prometheus.MustNewConstMetric(h.admission, prometheus.GaugeValue, boolean(cacheReady && serving && registered))
	authority := h.authority.Load()
	leading := h.leader.Load() && (authority == nil || authority.ctx.Err() == nil)
	ch <- prometheus.MustNewConstMetric(h.reconciliation, prometheus.GaugeValue, boolean(cacheReady && leading))
	ch <- prometheus.MustNewConstMetric(h.native, prometheus.GaugeValue, boolean(cacheReady && h.nativeActive()))
}
func boolean(value bool) float64 {
	if value {
		return 1
	}
	return 0
}

func (h *Health) Serve(ctx context.Context, address string) error {
	listener, err := net.Listen("tcp", address)
	if err != nil {
		return fmt.Errorf("listen for native metrics: %w", err)
	}
	mux := http.NewServeMux()
	mux.Handle("/metrics", promhttp.HandlerFor(h.registry, promhttp.HandlerOpts{}))
	server := &http.Server{Handler: mux, ReadHeaderTimeout: 5 * time.Second}
	go func() { _ = server.Serve(listener) }()
	go func() {
		<-ctx.Done()
		h.leader.Store(false)
		stop, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = server.Shutdown(stop)
	}()
	return nil
}

func (h *Health) nativeActive() bool {
	obj, exists, err := get(h.sources.Parameters, "uds-policy-exemptions/uds-native-grants")
	if err != nil || !exists {
		return false
	}
	parameters, ok := obj.(*unstructured.Unstructured)
	if !ok {
		return false
	}
	valid, _, err := unstructured.NestedBool(parameters.Object, "spec", "valid")
	revision, _, _ := unstructured.NestedString(parameters.Object, "spec", "revision")
	if err != nil || !valid || revision == "" || revision == "bootstrap-empty" || revision == "invalid-input" {
		return false
	}
	if h.sources.SnapshotCurrent == nil || !h.sources.SnapshotCurrent(revision) {
		return false
	}
	for _, expected := range h.contract {
		obj, exists, err := get(h.policyStore(expected.Kind), expected.Name)
		if err != nil || !exists || !expected.matches(obj) {
			return false
		}
	}
	return len(h.contract) != 0
}
func get(store cache.Store, key string) (interface{}, bool, error) {
	if store == nil {
		return nil, false, nil
	}
	return store.GetByKey(key)
}
