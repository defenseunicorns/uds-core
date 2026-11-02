// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
package exemptions

import (
	"encoding/json"
	"github.com/google/cel-go/cel"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"os"
	"testing"
)

func TestRE2PublishedMatcherDifferential(t *testing.T) {
	raw, err := os.ReadFile("testdata/re2-parity.json")
	if err != nil {
		t.Fatal(err)
	}
	var fixture struct {
		Cases []struct {
			Pattern, Name, GenerateName string
			Matched                     bool
		}
	}
	if err := json.Unmarshal(raw, &fixture); err != nil {
		t.Fatal(err)
	}
	raw, err = os.ReadFile("../../../native-admission/policies.json")
	if err != nil {
		t.Fatal(err)
	}
	var policies struct {
		Items []struct {
			Metadata struct{ Name string }
			Spec     struct {
				Variables []struct{ Name, Expression string }
			}
		}
	}
	if err := json.Unmarshal(raw, &policies); err != nil {
		t.Fatal(err)
	}
	expressions := map[string]string{}
	for _, policy := range policies.Items {
		if policy.Metadata.Name == "uds-native-pod-profile" {
			for _, variable := range policy.Spec.Variables {
				expressions[variable.Name] = variable.Expression
			}
		}
	}
	env, err := cel.NewEnv(cel.Variable("object", cel.DynType), cel.Variable("variables", cel.DynType), cel.Variable("params", cel.DynType), cel.Variable("request", cel.DynType))
	if err != nil {
		t.Fatal(err)
	}
	for _, test := range fixture.Cases {
		t.Run(test.Pattern+"/"+test.Name+"/"+test.GenerateName, func(t *testing.T) {
			result, err := Compile([]*unstructured.Unstructured{grant("a", ProtectedNamespace, test.Pattern, "pod", "DisallowPrivileged")}, false)
			if err != nil || len(result.NativeMatchers) != 1 {
				t.Fatalf("%+v %v", result, err)
			}
			name := test.Name
			if name == "" {
				name = test.GenerateName
			}
			goMatched := result.NativeMatchers[0].Compiled.MatchString(name)
			if goMatched != test.Matched {
				t.Fatal("RE2 changed captured JavaScript search semantics")
			}
			variables := map[string]interface{}{}
			parameters, _ := json.Marshal(result)
			var spec map[string]interface{}
			_ = json.Unmarshal(parameters, &spec)
			activation := map[string]interface{}{
				"object":  map[string]interface{}{"metadata": map[string]interface{}{"name": test.Name, "generateName": test.GenerateName}},
				"request": map[string]interface{}{"namespace": "app"},
				"params":  map[string]interface{}{"spec": spec}, "variables": variables,
			}
			for _, key := range []string{"resourceName", "resourceNamePresent", "grantDisallowPrivileged"} {
				ast, issues := env.Compile(expressions[key])
				if issues.Err() != nil {
					t.Fatal(issues.Err())
				}
				program, err := env.Program(ast)
				if err != nil {
					t.Fatal(err)
				}
				value, _, err := program.Eval(activation)
				if err != nil {
					t.Fatal(err)
				}
				variables[key] = value.Value()
			}
			if variables["grantDisallowPrivileged"] != goMatched {
				t.Fatalf("Go %v CEL %v", goMatched, variables["grantDisallowPrivileged"])
			}
		})
	}
}
