// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/google/cel-go/cel"
)

func retirementInputs() (map[string]interface{}, map[string]interface{}) {
	request := map[string]interface{}{"userInfo": map[string]interface{}{"username": "system:node:owned-node"}, "namespace": "keycloak", "name": "keycloak-0", "operation": "DELETE", "resource": map[string]interface{}{"group": "", "resource": "pods"}, "options": map[string]interface{}{"gracePeriodSeconds": int64(0), "preconditions": map[string]interface{}{"uid": "old-pod-uid"}}}
	old := map[string]interface{}{"metadata": map[string]interface{}{"uid": "old-pod-uid", "name": "keycloak-0", "namespace": "keycloak", "deletionTimestamp": "2026-10-04T21:00:03Z", "ownerReferences": []interface{}{map[string]interface{}{"controller": true, "kind": "StatefulSet", "name": "keycloak", "uid": "actual-owner-uid"}}}, "spec": map[string]interface{}{"nodeName": "owned-node"}, "status": map[string]interface{}{"phase": "Failed"}}
	return request, old
}

func TestBootstrapFenceBoundNodeTerminalUIDRetirement(t *testing.T) {
	documents, err := fenceDocuments("system:admin")
	if err != nil {
		t.Fatal(err)
	}
	if capture := os.Getenv("UDS_FENCE_CAPTURE_PATH"); capture != "" {
		if !filepath.IsAbs(capture) {
			t.Fatal("fence capture must use an explicit absolute path")
		}
		data, err := json.MarshalIndent(map[string]interface{}{"apiVersion": "v1", "kind": "List", "items": documents}, "", "  ")
		if err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(capture, append(data, '\n'), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	expression := documents[0]["spec"].(map[string]interface{})["validations"].([]interface{})[0].(map[string]interface{})["expression"].(string)
	env, err := cel.NewEnv(cel.Variable("request", cel.DynType), cel.Variable("object", cel.DynType), cel.Variable("oldObject", cel.DynType))
	if err != nil {
		t.Fatal(err)
	}
	ast, issues := env.Compile(expression)
	if issues.Err() != nil {
		t.Fatal(issues.Err())
	}
	program, err := env.Program(ast)
	if err != nil {
		t.Fatal(err)
	}
	for _, mode := range []string{"actual-kubelet", "completed-pod", "other-node", "tenant", "other-resource", "other-group", "subresource", "create", "update", "live-phase", "missing-phase", "no-deletion", "no-owner", "false-controller-owner", "missing-uid", "wrong-precondition", "missing-precondition", "missing-options", "nonzero-grace", "wrong-name", "wrong-namespace", "missing-node-name"} {
		t.Run(mode, func(t *testing.T) {
			r, old := retirementInputs()
			switch mode {
			case "completed-pod":
				mapAt(old, "status")["phase"] = "Succeeded"
			case "other-node":
				mapAt(r, "userInfo")["username"] = "system:node:other-node"
			case "tenant":
				r["namespace"] = "tenant"
				mapAt(old, "metadata")["namespace"] = "tenant"
			case "other-resource":
				mapAt(r, "resource")["resource"] = "secrets"
			case "other-group":
				mapAt(r, "resource")["group"] = "apps"
			case "subresource":
				r["subResource"] = "status"
			case "create":
				r["operation"] = "CREATE"
			case "update":
				r["operation"] = "UPDATE"
			case "live-phase":
				mapAt(old, "status")["phase"] = "Running"
			case "missing-phase":
				delete(old, "status")
			case "no-deletion":
				delete(mapAt(old, "metadata"), "deletionTimestamp")
			case "no-owner":
				delete(mapAt(old, "metadata"), "ownerReferences")
			case "false-controller-owner":
				mapAt(old, "metadata")["ownerReferences"] = []interface{}{map[string]interface{}{"controller": false}}
			case "missing-uid":
				delete(mapAt(old, "metadata"), "uid")
			case "wrong-precondition":
				mapAt(r, "options", "preconditions")["uid"] = "replacement-pod-uid"
			case "missing-precondition":
				delete(mapAt(r, "options"), "preconditions")
			case "missing-options":
				delete(r, "options")
			case "nonzero-grace":
				mapAt(r, "options")["gracePeriodSeconds"] = int64(30)
			case "wrong-name":
				r["name"] = "replacement-name"
			case "wrong-namespace":
				mapAt(old, "metadata")["namespace"] = "other-infra"
			case "missing-node-name":
				delete(mapAt(old, "spec"), "nodeName")
			}
			out, _, err := program.Eval(map[string]interface{}{"request": r, "object": nil, "oldObject": old})
			if err != nil {
				b, _ := json.Marshal(r)
				t.Fatalf("optional-field guard failed: %s: %v", b, err)
			}
			allowed := mode == "actual-kubelet" || mode == "completed-pod"
			if out.Value() != allowed {
				t.Fatalf("decision %v, expected %v", out, allowed)
			}
		})
	}
}
