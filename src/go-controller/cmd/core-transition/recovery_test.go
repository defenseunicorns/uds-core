// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestVerificationFailureAfterDrainCleansCanaryAndResumesForward(t *testing.T) {
	for _, canceled := range []bool{false, true} {
		t.Run(fmt.Sprint("cancel=", canceled), func(t *testing.T) { testVerificationRecovery(t, canceled) })
	}
}

func testVerificationRecovery(t *testing.T, cancelDuringVerify bool) {
	parent, cancel := context.WithCancel(context.Background())
	defer cancel()
	revision := strings.Repeat("a", 64)
	failVerify := true
	drained, deleted, retirementReads := false, 0, 0
	var scratch object
	policy := object{"kind": "ValidatingAdmissionPolicy", "metadata": object{"name": "probe-policy"}, "spec": object{"failurePolicy": "Fail"}}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		write := func(obj object) { json.NewEncoder(w).Encode(obj) }
		switch {
		case r.URL.Path == "/api/v1/namespaces/pepr-system":
			write(object{"metadata": object{"name": "pepr-system", "uid": "legacy"}})
		case strings.HasSuffix(r.URL.Path, "/deployments/pepr-uds-core-watcher"):
			if r.Method == "PATCH" {
				drained = true
			}
			obj := watcher()
			if drained {
				obj["spec"].(object)["replicas"] = 0
			}
			write(obj)
		case strings.HasSuffix(r.URL.Path, "/replicasets"), r.URL.Path == "/api/v1/namespaces/pepr-system/pods":
			write(object{"items": []any{}})
		case strings.HasSuffix(r.URL.Path, "/admissionparameters/uds-native-grants"):
			write(object{"spec": object{"valid": true, "revision": revision}})
		case strings.HasSuffix(r.URL.Path, "/clusterconfig/uds-cluster-config"):
			write(object{"status": object{"phase": "Ready"}})
		case strings.HasSuffix(r.URL.Path, "/packages/uds-controller"):
			write(object{"metadata": object{"uid": "core", "generation": 1}, "status": object{"phase": "Ready", "observedGeneration": 1}})
		case r.URL.Path == "/api/v1/namespaces" && r.Method == "POST":
			scratch = object{"metadata": object{"name": "uds-core-admission-probe-fixture", "uid": "canary", "labels": object{"app.kubernetes.io/managed-by": "uds-core-transition"}}}
			write(scratch)
		case strings.HasSuffix(r.URL.Path, "/serviceaccounts/default"):
			write(object{"metadata": object{"name": "default"}})
		case r.URL.Path == "/api/v1/namespaces/uds-core-admission-probe-fixture":
			if r.Method == "DELETE" {
				var body object
				json.NewDecoder(r.Body).Decode(&body)
				if str(body, "preconditions", "uid") != "canary" {
					t.Error("cleanup lost UID precondition")
				}
				deleted++
				scratch = nil
				write(object{})
				return
			}
			if scratch == nil {
				w.WriteHeader(404)
				return
			}
			write(scratch)
		case strings.Contains(r.URL.Path, "/validatingadmissionpolicies/"):
			if failVerify {
				if cancelDuringVerify {
					cancel()
				}
				w.WriteHeader(500)
				write(object{"message": "injected verification failure"})
				return
			}
			write(policy)
		case r.Method == "POST" && strings.HasSuffix(r.URL.Path, "/pods"):
			if r.URL.Query().Get("dryRun") != "All" || !strings.Contains(r.URL.Path, "uds-core-admission-probe-") {
				t.Error("canary escaped scratch dry run")
			}
			var body object
			json.NewDecoder(r.Body).Decode(&body)
			containers := get(body, "spec", "containers").([]any)
			container := object(containers[0].(map[string]any))
			if get(container, "securityContext", "privileged") == true {
				w.WriteHeader(422)
				write(object{"message": "uds-native-pod-profile denied privileged container"})
				return
			}
			write(object{"metadata": object{"annotations": object{"policy.uds.dev/native-mutation-revision": revision}}, "spec": object{"securityContext": object{"runAsNonRoot": true}}})
		case r.URL.Path == "/api/v1/namespaces/pepr-system/secrets":
			retirementReads++
			write(object{"items": []any{}})
		case strings.Contains(r.URL.Path, "/peprstores/"):
			w.WriteHeader(404)
		default:
			t.Errorf("unexpected request %s %s", r.Method, r.URL)
			w.WriteHeader(500)
		}
	}))
	defer server.Close()
	c := cluster{ctx: context.Background(), http: server.Client(), server: server.URL}
	if err := c.drain(); err != nil {
		t.Fatal(err)
	}
	dir := t.TempDir()
	contract := filepath.Join(dir, "contract.json")
	config := filepath.Join(dir, "kubeconfig")
	items := make([]object, 27)
	for i := range items {
		items[i] = policy
	}
	if err := os.WriteFile(contract, encode(object{"items": items}), 0600); err != nil {
		t.Fatal(err)
	}
	kubeconfig := object{"apiVersion": "v1", "kind": "Config", "clusters": []any{object{"name": "test", "cluster": object{"server": server.URL}}}, "contexts": []any{object{"name": "test", "context": object{"cluster": "test", "user": "test"}}}, "users": []any{object{"name": "test", "user": object{}}}, "current-context": "test"}
	if err := os.WriteFile(config, encode(kubeconfig), 0600); err != nil {
		t.Fatal(err)
	}
	args := []string{"--phase", "retire", "--kubeconfig", config, "--contract", contract}
	if err := Run(parent, args); err == nil || (!strings.Contains(err.Error(), "injected verification failure") && !strings.Contains(err.Error(), "context canceled")) {
		t.Fatal("injection did not gate retirement", err)
	}
	if cancelDuringVerify && parent.Err() == nil {
		t.Fatal("verification was not actually canceled")
	}
	if !drained || deleted != 1 || retirementReads != 0 {
		t.Fatal("failure restarted old writer, leaked canary, or retired before verification")
	}
	failVerify = false
	if err := Run(context.Background(), args); err != nil {
		t.Fatal("forward retry failed", err)
	}
	if deleted != 2 || retirementReads == 0 {
		t.Fatal("successful retry did not clean canary and reach retirement")
	}
}
