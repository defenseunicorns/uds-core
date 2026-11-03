// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
package main

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"
	"time"
)

func encode(value any) []byte { raw, _ := json.Marshal(value); return raw }
func watcher() object {
	return object{"kind": "Deployment", "metadata": object{"name": "pepr-uds-core-watcher", "namespace": "pepr-system", "uid": "watcher-uid", "resourceVersion": "10"}, "spec": object{"replicas": float64(1), "selector": object{"matchLabels": object{"app": "pepr-uds-core-watcher", "pepr.dev/controller": "watcher"}}}}
}
func TestDrainRejectsForeignDeploymentBeforeMutation(t *testing.T) {
	o := watcher()
	o["spec"].(object)["selector"] = object{"matchLabels": object{"app": "another-module"}}
	c := cluster{ctx: context.Background(), execute: func(_ []byte, args ...string) ([]byte, error) {
		if args[1] != "get" {
			t.Fatal("foreign deployment was mutated", args)
		}
		return encode(o), nil
	}}
	if err := c.drain(); err == nil {
		t.Fatal("foreign deployment accepted")
	}
}
func TestDrainWaitsForOwnedPodDeletionNotReadiness(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Millisecond)
	defer cancel()
	o := watcher()
	patched := false
	c := cluster{ctx: ctx, execute: func(_ []byte, args ...string) ([]byte, error) {
		switch args[1] {
		case "patch":
			var operations []object
			if err := json.Unmarshal([]byte(args[6]), &operations); err != nil {
				t.Fatal(err)
			}
			if operations[0]["path"] != "/metadata/uid" || operations[0]["value"] != "watcher-uid" || operations[1]["value"] != "10" {
				t.Fatal("drain lacks immutable preconditions")
			}
			patched = true
			o["spec"].(object)["replicas"] = float64(0)
			return []byte("{}"), nil
		case "get":
			switch args[2] {
			case "namespace":
				return encode(object{"kind": "Namespace", "metadata": object{"name": "pepr-system"}}), nil
			case "deployment":
				return encode(o), nil
			case "replicasets":
				return encode(object{"items": []any{object{"metadata": object{"uid": "owned-set", "ownerReferences": []any{object{"kind": "Deployment", "uid": "watcher-uid", "controller": true}}}}}}), nil
			case "pods":
				return encode(object{"items": []any{object{"metadata": object{"ownerReferences": []any{object{"kind": "ReplicaSet", "uid": "owned-set", "controller": true}}}, "status": object{"phase": "Running", "ready": false}}}}), nil
			}
		}
		t.Fatal("unexpected cluster operation", args)
		return nil, nil
	}}
	if err := c.drain(); !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("undrained watcher accepted: %v", err)
	}
	if !patched {
		t.Fatal("watcher was not scaled down")
	}
}
func TestDeleteUsesFetchedUIDAndVersion(t *testing.T) {
	o := object{"apiVersion": "apps/v1", "kind": "Deployment", "metadata": object{"name": "pepr-uds-core", "namespace": "pepr-system", "uid": "admission-uid", "resourceVersion": "99"}}
	c := cluster{ctx: context.Background(), execute: func(input []byte, args ...string) ([]byte, error) {
		if strings.Join(args, " ") != "kubectl delete --raw /apis/apps/v1/namespaces/pepr-system/deployments/pepr-uds-core -f -" {
			t.Fatal(args)
		}
		var body object
		if err := json.Unmarshal(input, &body); err != nil {
			t.Fatal(err)
		}
		if str(body, "preconditions", "uid") != "admission-uid" || str(body, "preconditions", "resourceVersion") != "99" {
			t.Fatal("unsafe name-only cleanup")
		}
		return []byte("{}"), nil
	}}
	if err := c.remove(o); err != nil {
		t.Fatal(err)
	}
}
func TestDeletionCannotTargetNamespaceOrSharedCRD(t *testing.T) {
	c := cluster{ctx: context.Background(), execute: func(_ []byte, _ ...string) ([]byte, error) {
		t.Fatal("shared resource deletion attempted")
		return nil, nil
	}}
	for _, kind := range []string{"Namespace", "CustomResourceDefinition"} {
		if err := c.remove(object{"kind": kind}); err == nil {
			t.Fatal("shared cleanup allowed", kind)
		}
	}
}
func TestContractComparisonRejectsMissingAuthority(t *testing.T) {
	want := map[string]any{"failurePolicy": "Fail", "rules": []any{map[string]any{"resources": []any{"pods", "pods/ephemeralcontainers"}}}}
	if subset(want, map[string]any{"failurePolicy": "Ignore"}) {
		t.Fatal("fail-open authority accepted")
	}
	if subset(want, map[string]any{"failurePolicy": "Fail", "rules": []any{map[string]any{"resources": []any{"pods"}}}}) {
		t.Fatal("partial authority accepted")
	}
	if !subset(want, map[string]any{"failurePolicy": "Fail", "extraDefault": true, "rules": []any{map[string]any{"resources": []any{"pods", "pods/ephemeralcontainers"}, "scope": "*"}}}) {
		t.Fatal("compatible API defaults rejected")
	}
}
