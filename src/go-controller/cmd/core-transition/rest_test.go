// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
package main

import (
	"bytes"
	"compress/gzip"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestRESTDeleteKeepsUIDVersionAndConfiguredCluster(t *testing.T) {
	called := false
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called = true
		if r.Method != http.MethodDelete || r.URL.Path != "/apis/apps/v1/namespaces/pepr-system/deployments/pepr-uds-core" {
			t.Error("wrong cleanup request", r.Method, r.URL.Path)
		}
		var body object
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Error(err)
		}
		if str(body, "preconditions", "uid") != "owned-uid" || str(body, "preconditions", "resourceVersion") != "55" {
			t.Error("cleanup lost ownership preconditions")
		}
		w.Write([]byte(`{"kind":"Status","status":"Success"}`))
	}))
	defer server.Close()
	c := cluster{ctx: context.Background(), http: server.Client(), server: server.URL}
	err := c.remove(object{"apiVersion": "apps/v1", "kind": "Deployment", "metadata": object{"namespace": "pepr-system", "name": "pepr-uds-core", "uid": "owned-uid", "resourceVersion": "55"}})
	if err != nil || !called {
		t.Fatal(err, called)
	}
}
func TestRESTReadErrorsCannotBecomeAbsentResources(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(403)
		w.Write([]byte(`{"message":"forbidden"}`))
	}))
	defer server.Close()
	c := cluster{ctx: context.Background(), http: server.Client(), server: server.URL}
	if _, err := c.get("deployment", "pepr-system", "pepr-uds-core-watcher"); err == nil || !strings.Contains(err.Error(), "forbidden") {
		t.Fatal("unavailable old writer treated as absent", err)
	}
}
func TestDryRunCanaryNeverPersistsAWorkload(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" || r.URL.Query().Get("dryRun") != "All" || r.URL.Path != "/api/v1/namespaces/default/pods" {
			t.Error("canary was not a scoped dry-run", r.URL.String())
		}
		w.Write([]byte(`{}`))
	}))
	defer server.Close()
	c := cluster{ctx: context.Background(), http: server.Client(), server: server.URL}
	_, err := c.kubectl(encode(object{"kind": "Pod", "metadata": object{"namespace": "default"}}), "create", "--dry-run=server", "-f", "-", "-o=json")
	if err != nil {
		t.Fatal(err)
	}
}
func TestHelmStateDecodeUsesRecordedManifest(t *testing.T) {
	manifest := "apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: pepr-uds-core\n"
	raw := encode(object{"manifest": manifest})
	var compressed bytes.Buffer
	writer := gzip.NewWriter(&compressed)
	writer.Write(raw)
	writer.Close()
	encoded := base64.StdEncoding.EncodeToString([]byte(base64.StdEncoding.EncodeToString(compressed.Bytes())))
	got, err := decodeRelease(encoded)
	if err != nil || got != manifest {
		t.Fatal("could not read legacy release for ownership-checked cleanup", err)
	}
}

func TestCleanupIncludesFailedAndSupersededHistory(t *testing.T) {
	manifest := "apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: pepr-uds-core\n  namespace: pepr-system\nspec:\n  selector:\n    matchLabels:\n      app: pepr-uds-core\n      pepr.dev/controller: admission\n"
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Query().Get("labelSelector") != "owner=helm,name=module" {
			t.Error("unscoped Helm history read", r.URL.String())
		}
		var items []object
		for _, status := range []string{"deployed", "failed", "superseded"} {
			raw := encode(object{"manifest": manifest + "---\napiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: " + status + "\n"})
			encoded := base64.StdEncoding.EncodeToString([]byte(base64.StdEncoding.EncodeToString(raw)))
			items = append(items, object{"metadata": object{"labels": object{"status": status}}, "data": object{"release": encoded}})
		}
		json.NewEncoder(w).Encode(object{"items": items})
	}))
	defer server.Close()
	c := cluster{ctx: context.Background(), http: server.Client(), server: server.URL}
	objects, err := c.releaseObjects("module")
	if err != nil || len(objects) != 6 {
		t.Fatal("incomplete release cleanup", len(objects), err)
	}
}

func TestCoreStoreCleanupNeverListsOtherModules(t *testing.T) {
	deleted := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		name := strings.TrimPrefix(r.URL.Path, "/apis/pepr.dev/v1/namespaces/pepr-system/peprstores/")
		if name != "pepr-uds-core-store" && name != "pepr-uds-core-schedule" {
			t.Fatal("accessed shared or foreign store", r.URL.Path)
		}
		if r.Method == http.MethodDelete {
			var body object
			json.NewDecoder(r.Body).Decode(&body)
			if str(body, "preconditions", "uid") != name+"-uid" || str(body, "preconditions", "resourceVersion") != "17" {
				t.Error("store delete omitted immutable preconditions")
			}
			deleted++
			w.Write([]byte(`{}`))
			return
		}
		json.NewEncoder(w).Encode(object{"apiVersion": "pepr.dev/v1", "kind": "PeprStore", "metadata": object{"name": name, "namespace": "pepr-system", "uid": name + "-uid", "resourceVersion": "17"}})
	}))
	defer server.Close()
	c := cluster{ctx: context.Background(), http: server.Client(), server: server.URL}
	if err := c.retireCoreStores(); err != nil || deleted != 2 {
		t.Fatal("Core runtime stores remain", deleted, err)
	}
}

func TestReleaseSecretListGetsTypeMetaBeforeImmutableDelete(t *testing.T) {
	deleted := false
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			if r.URL.Query().Get("labelSelector") != "owner=helm,name=module" {
				t.Error("unscoped release read")
			}
			w.Write([]byte(`{"items":[{"metadata":{"name":"sh.helm.release.v1.module.v1","namespace":"pepr-system","uid":"history-uid","resourceVersion":"88","labels":{"owner":"helm","name":"module"}}}]}`))
			return
		}
		if r.Method != http.MethodDelete || r.URL.Path != "/api/v1/namespaces/pepr-system/secrets/sh.helm.release.v1.module.v1" {
			t.Error("wrong history cleanup", r.Method, r.URL.Path)
		}
		var body object
		json.NewDecoder(r.Body).Decode(&body)
		if str(body, "preconditions", "uid") != "history-uid" || str(body, "preconditions", "resourceVersion") != "88" {
			t.Error("history cleanup lost immutable identity")
		}
		deleted = true
		w.Write([]byte(`{}`))
	}))
	defer server.Close()
	c := cluster{ctx: context.Background(), http: server.Client(), server: server.URL}
	if err := c.forgetRelease("module"); err != nil || !deleted {
		t.Fatal("release record not retired", deleted, err)
	}
}

func TestPreflightRequiresAllNativeV1APIsBeforeAnyMutation(t *testing.T) {
	for _, complete := range []bool{false, true} {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.Method != http.MethodGet || r.URL.Path != "/apis/admissionregistration.k8s.io/v1" {
				t.Error("preflight mutated the cluster", r.Method, r.URL.Path)
			}
			resources := []object{{"name": "validatingadmissionpolicies"}, {"name": "validatingadmissionpolicybindings"}, {"name": "mutatingadmissionpolicies"}}
			if complete {
				resources = append(resources, object{"name": "mutatingadmissionpolicybindings"})
			}
			json.NewEncoder(w).Encode(object{"resources": resources})
		}))
		c := cluster{ctx: context.Background(), http: server.Client(), server: server.URL}
		err := c.preflight()
		server.Close()
		if (err == nil) != complete {
			t.Fatal("incomplete native authority accepted", complete, err)
		}
	}
}

func TestCanariesWaitForMutationAndNativeValidationCacheConvergence(t *testing.T) {
	requests := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			w.Write([]byte(`{"spec":{"revision":"current"}}`))
			return
		}
		if r.URL.Query().Get("dryRun") != "All" {
			t.Error("canary was persisted")
		}
		requests++
		switch requests {
		case 1:
			w.WriteHeader(422)
			json.NewEncoder(w).Encode(object{"message": "ValidatingAdmissionPolicy 'uds-native-pod-profile' denied request: mutation cache not active"})
		case 3:
			w.WriteHeader(422)
			json.NewEncoder(w).Encode(object{"message": `admission webhook "pepr-uds-core.pepr.dev" denied the request`})
		case 5:
			w.WriteHeader(422)
			json.NewEncoder(w).Encode(object{"message": "ValidatingAdmissionPolicy 'uds-native-pod-profile' denied request: Privilege escalation is disallowed"})
		default:
			json.NewEncoder(w).Encode(object{"metadata": object{"annotations": object{"policy.uds.dev/native-mutation-revision": "current"}}, "spec": object{"securityContext": object{"runAsNonRoot": true}}})
		}
	}))
	defer server.Close()
	c := cluster{ctx: context.Background(), http: server.Client(), server: server.URL}
	for attempt := 0; attempt < 3; attempt++ {
		ready, err := c.canaries()
		if err != nil || ready != (attempt == 2) {
			t.Fatal("authority accepted too early or cache lag became fatal", attempt, ready, err)
		}
	}
	if canaryCacheConverging(context.DeadlineExceeded) || canaryCacheConverging(errors.New("another module denied the request")) {
		t.Fatal("unrelated failure treated as Core cache convergence")
	}
}
