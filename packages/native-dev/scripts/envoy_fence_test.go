// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
package main

import (
	"testing"

	"github.com/google/cel-go/cel"
)

func TestBootstrapFenceBoundsEnvoyOwnedChildren(t *testing.T) {
	documents, err := fenceDocuments("system:admin")
	if err != nil {
		t.Fatal(err)
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
	for _, resource := range []string{"deployments", "services", "serviceaccounts", "configmaps"} {
		for _, variation := range []string{"create", "update", "tenant-actor", "foreign-sa", "tenant-namespace", "other-object", "no-owner", "other-owner", "wrong-owner-kind", "wrong-owner-version", "wrong-group", "subresource", "delete", "secret"} {
			t.Run(resource+"/"+variation, func(t *testing.T) {
				request, object := envoyFenceRequest(resource, variation)
				out, _, err := program.Eval(map[string]interface{}{"request": request, "object": object, "oldObject": nil})
				if err != nil {
					t.Fatal(err)
				}
				want := variation == "create" || variation == "update"
				if out.Value() != want {
					t.Fatalf("allowed=%v, want %v", out.Value(), want)
				}
			})
		}
	}
}

func envoyFenceRequest(resource, variation string) (map[string]interface{}, map[string]interface{}) {
	group := ""
	if resource == "deployments" {
		group = "apps"
	}
	user := map[string]interface{}{"username": "system:serviceaccount:envoy-gateway-system:envoy-gateway"}
	gvr := map[string]interface{}{"group": group, "resource": resource}
	request := map[string]interface{}{"userInfo": user, "namespace": "envoy-default-gateway", "operation": "CREATE", "resource": gvr}
	owner := map[string]interface{}{"apiVersion": "gateway.networking.k8s.io/v1", "kind": "Gateway", "name": "envoy-default-gateway", "uid": "actual-gateway-uid"}
	metadata := map[string]interface{}{"name": "envoy-default-gateway", "ownerReferences": []interface{}{owner}}
	object := map[string]interface{}{"metadata": metadata}
	switch variation {
	case "update":
		request["operation"] = "UPDATE"
	case "tenant-actor":
		user["username"] = "system:serviceaccount:tenant:envoy-gateway"
	case "foreign-sa":
		user["username"] = "system:serviceaccount:envoy-gateway-system:other"
	case "tenant-namespace":
		request["namespace"] = "tenant"
	case "other-object":
		metadata["name"] = "other"
	case "no-owner":
		delete(metadata, "ownerReferences")
	case "other-owner":
		owner["name"] = "tenant-gateway"
	case "wrong-owner-kind":
		owner["kind"] = "Deployment"
	case "wrong-owner-version":
		owner["apiVersion"] = "apps/v1"
	case "wrong-group":
		gvr["group"] = "tenant.example"
	case "subresource":
		request["subResource"] = "status"
	case "delete":
		request["operation"] = "DELETE"
	case "secret":
		gvr["group"], gvr["resource"] = "", "secrets"
	}
	return request, object
}
