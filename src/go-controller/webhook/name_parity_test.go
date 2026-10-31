// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package webhook

import (
	"encoding/json"
	"github.com/defenseunicorns/uds-core/src/go-controller/internal/admission/resources"
	"github.com/google/cel-go/cel"
	"os"
	"testing"
)

func TestPinnedExemptionNameSelection(t *testing.T) {
	raw, err := os.ReadFile("testdata/exemption-name-parity.json")
	if err != nil {
		t.Fatal(err)
	}
	var fixture struct {
		SourceRevision string
		Cases          []struct {
			Pattern string
			Object  json.RawMessage
			Matched bool
		}
	}
	if err := json.Unmarshal(raw, &fixture); err != nil {
		t.Fatal(err)
	}
	if fixture.SourceRevision != "c15677633cffa17e99656a7d7ccd1f98d7cb6e4d" || len(fixture.Cases) != 21 {
		t.Fatal("incomplete pinned name selection corpus")
	}
	var manifest struct {
		Items []struct {
			Kind     string
			Metadata struct{ Name string }
			Spec     struct {
				Variables []struct{ Name, Expression string }
			}
		}
	}
	policyRaw, err := os.ReadFile("../native-admission/policies.json")
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(policyRaw, &manifest); err != nil {
		t.Fatal(err)
	}
	expressions := map[string]string{}
	for _, policy := range manifest.Items {
		if policy.Kind == "ValidatingAdmissionPolicy" && policy.Metadata.Name == "uds-native-pod-profile" {
			for _, variable := range policy.Spec.Variables {
				expressions[variable.Name] = variable.Expression
			}
		}
	}
	env, err := cel.NewEnv(cel.Variable("object", cel.DynType), cel.Variable("request", cel.DynType), cel.Variable("params", cel.DynType), cel.Variable("variables", cel.DynType))
	if err != nil {
		t.Fatal(err)
	}
	programs := map[string]cel.Program{}
	for _, name := range []string{"resourceName", "resourceNamePresent", "grantDisallowPrivileged"} {
		ast, issues := env.Compile(expressions[name])
		if issues.Err() != nil {
			t.Fatal(issues.Err())
		}
		program, err := env.Program(ast)
		if err != nil {
			t.Fatal(err)
		}
		programs[name] = program
	}
	for _, test := range fixture.Cases {
		t.Run(test.Pattern+"/"+string(test.Object), func(t *testing.T) {
			object, err := resources.Decode(test.Object)
			if err != nil {
				t.Fatal(err)
			}
			store := NewExemptionStore()
			if err := store.Set("owner", []ExemptionEntry{{Namespace: "app", Name: test.Pattern, Policies: []string{"DisallowPrivileged"}}}); err != nil {
				t.Fatal(err)
			}
			if matched := store.MetadataEvaluator(object.Object("metadata"))("DisallowPrivileged"); matched != test.Matched {
				t.Fatalf("Go name selection differs: got %t reference %t", matched, test.Matched)
			}
			var celObject map[string]interface{}
			_ = json.Unmarshal(test.Object, &celObject)
			variables := map[string]interface{}{}
			activation := map[string]interface{}{"object": celObject, "request": map[string]interface{}{"namespace": "app"}, "variables": variables, "params": map[string]interface{}{"spec": map[string]interface{}{"nativeMatchers": []interface{}{map[string]interface{}{"namespace": "app", "policy": "DisallowPrivileged", "pattern": test.Pattern}}}}}
			for _, name := range []string{"resourceName", "resourceNamePresent"} {
				value, _, err := programs[name].Eval(activation)
				if err != nil {
					t.Fatal(err)
				}
				variables[name] = value.Value()
			}
			value, _, err := programs["grantDisallowPrivileged"].Eval(activation)
			if err != nil {
				t.Fatal(err)
			}
			if value.Value() != test.Matched {
				t.Fatalf("native name selection differs: got %v reference %t", value, test.Matched)
			}
		})
	}
}
