// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
package main

import (
	"context"
	"k8s.io/client-go/rest"
	"net/http"
	"net/http/httptest"
	"os"
	"reflect"
	"sync/atomic"
	"testing"
	"time"
)

// The fixture image keeps an idle process alive and contains the real FIPS
// controller binary at its production path. No Zarf or kubectl is invoked.
func TestLiveFIPSExecWithoutHostCLI(t *testing.T) {
	path := os.Getenv("UDS_FIPS_EXEC_TEST_KUBECONFIG")
	if path == "" {
		t.Skip("requires isolated live FIPS Pod fixture")
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()
	c := cluster{ctx: ctx, zarf: "/nonexistent/zarf"}
	if err := c.initializeREST(path); err != nil {
		t.Fatal(err)
	}
	if err := c.verifyFIPS(); err != nil {
		t.Fatal(err)
	}
}

func TestPodExecUsesLoadedConfigurationWithoutHostCLI(t *testing.T) {
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		if r.URL.Path != "/cluster/api/v1/namespaces/uds-system/pods/controller-one/exec" {
			t.Errorf("wrong target %s", r.URL)
		}
		if r.Header.Get("Authorization") != "Bearer fixture-token" {
			t.Error("lost loaded credentials")
		}
		if r.URL.Query().Get("container") != "controller" || !reflect.DeepEqual(r.URL.Query()["command"], []string{"/usr/local/bin/uds-controller", "--build-info"}) {
			t.Error("wrong remote command")
		}
		http.Error(w, "fixture denies exec", http.StatusForbidden)
	}))
	defer server.Close()
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	c := cluster{ctx: ctx, zarf: "/nonexistent/zarf", restConfig: &rest.Config{Host: server.URL + "/cluster", BearerToken: "fixture-token"}}
	if _, err := c.podBuildInfo("controller-one"); err == nil {
		t.Fatal("API denial was ignored")
	}
	if calls.Load() == 0 {
		t.Fatal("helper did not use the Kubernetes exec API")
	}
}
