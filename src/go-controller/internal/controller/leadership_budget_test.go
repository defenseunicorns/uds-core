// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
package controller

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	coordinationclient "k8s.io/client-go/kubernetes/typed/coordination/v1"
	"k8s.io/client-go/rest"
)

func TestLeaseRenewalCannotWaitBehindReconciliationBudget(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/apis/coordination.k8s.io/v1/namespaces/uds-system/leases/uds-native-controller" {
			t.Error("unexpected Lease target", r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"apiVersion":"coordination.k8s.io/v1","kind":"Lease","metadata":{"name":"uds-native-controller","namespace":"uds-system"}}`))
	}))
	defer server.Close()
	data := controllerClientConfig(&rest.Config{Host: server.URL, QPS: 1, Burst: 1})
	if !data.RateLimiter.TryAccept() || data.RateLimiter.TryAccept() {
		t.Fatal("fixture did not exhaust reconciliation budget")
	}
	lease := leadershipClientConfig(data)
	if lease.RateLimiter == data.RateLimiter || data.Timeout != 0 || data.QPS != 1 || data.Burst != 1 {
		t.Fatal("Lease renewal shares or mutates reconciliation configuration")
	}
	if lease.QPS != 1 || lease.Burst != 2 || lease.Timeout != 5*time.Second {
		t.Fatal("unbounded Lease client")
	}
	client, err := coordinationclient.NewForConfig(lease)
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 250*time.Millisecond)
	defer cancel()
	if _, err := client.Leases("uds-system").Get(ctx, "uds-native-controller", metav1.GetOptions{}); err != nil {
		t.Fatal("Lease renewal starved behind exhausted reconciliation budget", err)
	}
}
