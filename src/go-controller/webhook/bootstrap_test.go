// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package webhook

import (
	"encoding/json"
	"github.com/google/cel-go/cel"
	"os"
	"testing"
)

func TestAuthenticatedRecoveryScope(t *testing.T) {
	raw, err := os.ReadFile("../native-admission/bootstrap.json")
	if err != nil {
		t.Fatal(err)
	}
	var expressions map[string]string
	if err := json.Unmarshal(raw, &expressions); err != nil {
		t.Fatal(err)
	}
	env, err := cel.NewEnv(cel.Variable("request", cel.DynType), cel.Variable("object", cel.DynType))
	if err != nil {
		t.Fatal(err)
	}
	ast, issues := env.Compile(expressions["pod"])
	if issues.Err() != nil {
		t.Fatal(issues.Err())
	}
	program, err := env.Program(ast)
	if err != nil {
		t.Fatal(err)
	}
	baseRequest := map[string]interface{}{"namespace": "uds-system", "resource": map[string]interface{}{"group": "", "resource": "pods"}, "subResource": "", "userInfo": map[string]interface{}{"username": "system:serviceaccount:kube-system:replicaset-controller", "groups": []string{"system:authenticated"}}}
	baseObject := map[string]interface{}{"metadata": map[string]interface{}{"name": "uds-controller-a1b2c3-test", "ownerReferences": []interface{}{map[string]interface{}{"apiVersion": "apps/v1", "kind": "ReplicaSet", "name": "uds-controller-a1b2c3", "controller": true}}}, "spec": map[string]interface{}{"serviceAccountName": "uds-controller", "containers": []interface{}{map[string]interface{}{"name": "controller"}}}}
	cases := []struct {
		name            string
		request, object func(map[string]interface{})
		expected        bool
	}{
		{"replicaset recreation", nil, nil, true},
		{"omitted empty subResource", func(r map[string]interface{}) { delete(r, "subResource") }, nil, true},
		{"controller actor with omitted groups", func(r map[string]interface{}) { delete(r["userInfo"].(map[string]interface{}), "groups") }, nil, true},
		{"unknown actor with omitted groups", func(r map[string]interface{}) { r["userInfo"] = map[string]interface{}{"username": "tenant"} }, nil, false},
		{"controller manager recreation", func(r map[string]interface{}) {
			r["userInfo"] = map[string]interface{}{"username": "system:kube-controller-manager", "groups": []string{"system:authenticated"}}
		}, nil, true},
		{"system administrator recreation", func(r map[string]interface{}) {
			r["userInfo"] = map[string]interface{}{"username": "admin", "groups": []string{"system:masters"}}
		}, nil, true},
		{"forged names and SA by tenant", func(r map[string]interface{}) {
			r["userInfo"] = map[string]interface{}{"username": "system:serviceaccount:app:uds-controller", "groups": []string{"system:authenticated"}}
		}, nil, false},
		{"controller fields in tenant namespace", func(r map[string]interface{}) { r["namespace"] = "app" }, nil, false},
		{"controller self service account", func(r map[string]interface{}) {
			r["userInfo"] = map[string]interface{}{"username": "system:serviceaccount:uds-system:uds-controller", "groups": []string{"system:authenticated"}}
		}, nil, false},
		{"ordinary system pod", nil, func(o map[string]interface{}) { o["spec"].(map[string]interface{})["serviceAccountName"] = "default" }, false},
		{"fake controller name only", nil, func(o map[string]interface{}) {
			o["metadata"].(map[string]interface{})["ownerReferences"] = []interface{}{}
		}, false},
		{"owner field without controller bit", nil, func(o map[string]interface{}) {
			o["metadata"].(map[string]interface{})["ownerReferences"] = []interface{}{map[string]interface{}{"apiVersion": "apps/v1", "kind": "ReplicaSet", "name": "uds-controller-fake"}}
		}, false},
		{"extra unreviewed container", nil, func(o map[string]interface{}) {
			o["spec"].(map[string]interface{})["containers"] = []interface{}{map[string]interface{}{"name": "controller"}, map[string]interface{}{"name": "app"}}
		}, false},
		{"numeric label overrides use ordinary admission", nil, func(o map[string]interface{}) {
			o["metadata"].(map[string]interface{})["labels"] = map[string]interface{}{"uds/user": "0"}
		}, false},
		{"ephemeral update is ordinary admission", func(r map[string]interface{}) { r["subResource"] = "ephemeralcontainers" }, nil, false},
		{"tenant skip labels and annotations", func(r map[string]interface{}) {
			r["userInfo"] = map[string]interface{}{"username": "tenant", "groups": []string{"system:authenticated"}}
		}, func(o map[string]interface{}) {
			o["metadata"].(map[string]interface{})["labels"] = map[string]interface{}{"app": "uds-controller", "uds.dev/native-skip": "true"}
			o["metadata"].(map[string]interface{})["annotations"] = map[string]interface{}{"uds-core.pepr.dev/uds-core-policies.DisallowPrivileged": "exempted"}
		}, false},
	}
	for _, test := range cases {
		t.Run(test.name, func(t *testing.T) {
			request, object := cloneMap(baseRequest), cloneMap(baseObject)
			if test.request != nil {
				test.request(request)
			}
			if test.object != nil {
				test.object(object)
			}
			value, _, err := program.Eval(map[string]interface{}{"request": request, "object": object})
			if err != nil {
				t.Fatal(err)
			}
			if value.Value() != test.expected {
				t.Fatalf("got %v expected %t", value, test.expected)
			}
		})
	}
	var manifest struct {
		Items []struct {
			Kind     string
			Metadata struct{ Name string }
			Spec     map[string]interface{}
		}
	}
	policies, err := os.ReadFile("../native-admission/policies.json")
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(policies, &manifest); err != nil {
		t.Fatal(err)
	}
	for _, item := range manifest.Items {
		if item.Kind == "ValidatingAdmissionPolicy" && item.Metadata.Name == "uds-native-controller-pod-recovery" {
			if _, exists := item.Spec["paramKind"]; exists {
				t.Fatal("bootstrap safety depends on parameter availability")
			}
			if len(item.Spec["validations"].([]interface{})) != 16 {
				t.Fatal("bootstrap does not enforce all Pod policies")
			}
			return
		}
	}
	t.Fatal("mandatory native recovery enforcement is absent")
}

func cloneMap(value map[string]interface{}) map[string]interface{} {
	raw, _ := json.Marshal(value)
	var copy map[string]interface{}
	_ = json.Unmarshal(raw, &copy)
	return copy
}
