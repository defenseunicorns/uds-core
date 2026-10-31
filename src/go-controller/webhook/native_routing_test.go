// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package webhook

import (
	"encoding/json"
	"os"
	"strings"
	"testing"

	"github.com/defenseunicorns/uds-core/src/go-controller/internal/admission/policies"
	"github.com/defenseunicorns/uds-core/src/go-controller/internal/admission/resources"
	"github.com/google/cel-go/cel"
	"github.com/google/cel-go/ext"
	jsonpatch "gopkg.in/evanphx/json-patch.v4"
)

type nativePolicyFixture struct {
	Items []struct {
		Kind     string
		Metadata struct{ Name string }
		Spec     struct {
			Variables   []struct{ Name, Expression string }
			Validations []struct{ Expression, Message string }
			Mutations   []struct{ JSONPatch struct{ Expression string } }
		}
	}
}

func nativeExpressions(t *testing.T, name string) (map[string]string, []string) {
	t.Helper()
	raw, err := os.ReadFile("../native-admission/policies.json")
	if err != nil {
		t.Fatal(err)
	}
	var fixture nativePolicyFixture
	if err := json.Unmarshal(raw, &fixture); err != nil {
		t.Fatal(err)
	}
	for _, policy := range fixture.Items {
		if policy.Kind != "ValidatingAdmissionPolicy" && policy.Kind != "MutatingAdmissionPolicy" || policy.Metadata.Name != name {
			continue
		}
		expressions, validations := map[string]string{}, []string{}
		for _, variable := range policy.Spec.Variables {
			expressions[variable.Name] = variable.Expression
		}
		for _, validation := range policy.Spec.Validations {
			validations = append(validations, validation.Expression)
			expressions["validation:"+validation.Message] = validation.Expression
		}
		for index, mutation := range policy.Spec.Mutations {
			expressions["mutation"+string(rune('0'+index))] = mutation.JSONPatch.Expression
		}
		return expressions, validations
	}
	t.Fatal("generated policy missing: " + name)
	return nil, nil
}

func evalNative(t *testing.T, expression string, activation map[string]interface{}) interface{} {
	t.Helper()
	env, err := cel.NewEnv(cel.Variable("object", cel.DynType), cel.Variable("request", cel.DynType), cel.Variable("params", cel.DynType), cel.Variable("variables", cel.DynType), ext.Strings())
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
	value, _, err := program.Eval(activation)
	if err != nil {
		t.Fatal(err)
	}
	return value.Value()
}

func TestNativeStaticCallbackRouting(t *testing.T) {
	raw, err := os.ReadFile("../native-admission/routing.json")
	if err != nil {
		t.Fatal(err)
	}
	var routing map[string]string
	if err := json.Unmarshal(raw, &routing); err != nil {
		t.Fatal(err)
	}
	base := map[string]interface{}{"metadata": map[string]interface{}{}, "spec": map[string]interface{}{"containers": []interface{}{map[string]interface{}{"name": "app"}}}}
	cases := []struct {
		name, namespace, resource string
		change                    func(map[string]interface{})
		mutate, validate          bool
	}{
		{"ordinary Pod stays native", "app", "pods", nil, false, false},
		{"ordinary Service stays native", "app", "services", nil, false, false},
		{"protected namespace complete fallback", "uds-system", "pods", nil, true, true},
		{"forged routing asks more enforcement", "app", "pods", func(o map[string]interface{}) {
			o["metadata"].(map[string]interface{})["annotations"] = map[string]interface{}{routing["annotation"]: "forged"}
		}, true, true},
		{"stale Service routing asks more enforcement", "app", "services", func(o map[string]interface{}) {
			o["metadata"].(map[string]interface{})["annotations"] = map[string]interface{}{routing["annotation"]: "stale"}
		}, true, true},
		{"empty routing cannot delegate", "app", "pods", func(o map[string]interface{}) {
			o["metadata"].(map[string]interface{})["annotations"] = map[string]interface{}{routing["annotation"]: ""}
		}, false, false},
		{"numeric label uses JS conversion", "app", "pods", func(o map[string]interface{}) {
			o["metadata"].(map[string]interface{})["labels"] = map[string]interface{}{"uds/user": "0x400"}
		}, true, false},
		{"empty identity label ordinary", "app", "pods", func(o map[string]interface{}) {
			o["metadata"].(map[string]interface{})["labels"] = map[string]interface{}{"uds/user": ""}
		}, false, false},
		{"tenant exemption marker cannot skip", "app", "pods", func(o map[string]interface{}) {
			o["metadata"].(map[string]interface{})["annotations"] = map[string]interface{}{"uds-core.pepr.dev/uds-core-policies.DisallowPrivileged": "exempted"}
		}, false, false},
	}
	for _, field := range []string{"containers", "initContainers", "ephemeralContainers"} {
		for _, name := range []string{"istio-proxy", "istio-init"} {
			field, name := field, name
			cases = append(cases, struct {
				name, namespace, resource string
				change                    func(map[string]interface{})
				mutate, validate          bool
			}{field + "/" + name, "app", "pods", func(o map[string]interface{}) {
				o["spec"].(map[string]interface{})[field] = []interface{}{map[string]interface{}{"name": name}}
			}, false, true})
		}
	}
	for _, test := range cases {
		t.Run(test.name, func(t *testing.T) {
			object := cloneMap(base)
			if test.change != nil {
				test.change(object)
			}
			activation := map[string]interface{}{"object": object, "request": map[string]interface{}{"namespace": test.namespace, "resource": map[string]interface{}{"resource": test.resource}}}
			for key, expected := range map[string]bool{"mutate": test.mutate, "validate": test.validate} {
				if actual := evalNative(t, routing[key], activation); actual != expected {
					t.Fatalf("%s callback got %v want %t", key, actual, expected)
				}
			}
		})
	}
}

func TestNativeLegacyRevisionBarrier(t *testing.T) {
	expressions, _ := nativeExpressions(t, "uds-native-pod-profile")
	for _, marker := range []string{"", "stale", "current"} {
		t.Run(marker, func(t *testing.T) {
			variables := map[string]interface{}{}
			activation := map[string]interface{}{"object": map[string]interface{}{"metadata": map[string]interface{}{"annotations": map[string]interface{}{"policy.uds.dev/native-fallback": marker}}}, "params": map[string]interface{}{"spec": map[string]interface{}{"revision": "current"}}, "variables": variables}
			variables["fallbackReady"] = evalNative(t, expressions["fallbackReady"], activation)
			for name := range expressions {
				if strings.HasPrefix(name, "legacy") {
					variables[name] = name == "legacyDisallowPrivileged"
				}
			}
			if got := evalNative(t, expressions["validation:Legacy exemption evaluation requires the current complete Go admission callback"], activation); got != (marker == "current") {
				t.Fatalf("legacy delegation with %q got %v", marker, got)
			}
		})
	}
}

func TestNativeDiagnosticCompatibility(t *testing.T) {
	expressions, _ := nativeExpressions(t, "uds-native-defaults-profile")
	cases := []struct {
		text       string
		goRequired bool
		values     []string
	}{
		{"", false, []string{}},
		{"[]", false, []string{}},
		{" [ \t\r\n ] ", false, []string{}},
		{`["drop-all-capabilities","disallow-privileged","drop-all-capabilities"]`, false, []string{"drop-all-capabilities", "disallow-privileged", "drop-all-capabilities"}},
		{" [ \"require-non-root-user\" , \"drop-all-capabilities\" ] ", false, []string{"require-non-root-user", "drop-all-capabilities"}},
		{`["unknown",3,null,{"preserve":"value"}]`, true, nil},
		{`["\u0064rop-all-capabilities"]`, true, nil},
		{" [\f] ", true, nil},
		{`["unterminated]`, true, nil},
		{`null`, true, nil},
		{`{}`, true, nil},
	}
	for _, test := range cases {
		t.Run(test.text, func(t *testing.T) {
			variables := map[string]interface{}{}
			activation := map[string]interface{}{"object": map[string]interface{}{"metadata": map[string]interface{}{"annotations": map[string]interface{}{"uds-core.pepr.dev/mutated": test.text}}}, "variables": variables}
			for _, name := range []string{"diagnosticText", "diagnosticNeedsGo", "priorDiagnostic"} {
				variables[name] = evalNative(t, expressions[name], activation)
			}
			if variables["diagnosticNeedsGo"] != test.goRequired {
				t.Fatalf("Go required: got %v want %t", variables["diagnosticNeedsGo"], test.goRequired)
			}
			if !test.goRequired {
				raw, _ := json.Marshal(variables["priorDiagnostic"])
				want, _ := json.Marshal(test.values)
				if string(raw) != string(want) {
					t.Fatalf("array changed: got %s want %s", raw, want)
				}
			}
		})
	}
}

func TestNativeDiagnosticOutputMatchesCompleteGo(t *testing.T) {
	expressions, _ := nativeExpressions(t, "uds-native-defaults-profile")
	patch := expressions["mutation2"]
	start := strings.LastIndex(patch, "value:")
	end := strings.LastIndex(patch, "}]")
	if start < 0 || end < start {
		t.Fatal("generated diagnostic value is absent")
	}
	valueExpression := patch[start+len("value:") : end]
	for _, annotation := range []string{"", "[]", " [\r\n] ", `["drop-all-capabilities","disallow-privileged","drop-all-capabilities"]`, ` [ "require-non-root-user" ] `} {
		for _, alreadyDefaulted := range []bool{false, true} {
			t.Run(annotation, func(t *testing.T) {
				container := map[string]interface{}{"name": "app"}
				if alreadyDefaulted {
					container["securityContext"] = map[string]interface{}{"allowPrivilegeEscalation": false, "capabilities": map[string]interface{}{"drop": []string{"ALL"}}}
				}
				object := map[string]interface{}{"metadata": map[string]interface{}{"annotations": map[string]interface{}{"uds-core.pepr.dev/mutated": annotation}}, "spec": map[string]interface{}{"containers": []interface{}{container}}}
				variables := map[string]interface{}{"privilegeDefault": !alreadyDefaulted, "identityLabels": false}
				for _, policy := range []string{"DisallowPrivileged", "RequireNonRootUser", "DropAllCapabilities"} {
					variables["grant"+policy], variables["legacy"+policy] = false, false
				}
				activation := map[string]interface{}{"object": object, "variables": variables}
				for _, name := range []string{"diagnosticText", "diagnosticNeedsGo", "priorDiagnostic"} {
					variables[name] = evalNative(t, expressions[name], activation)
				}
				native := evalNative(t, valueExpression, activation)
				raw, _ := json.Marshal(object)
				decoded, _ := resources.Decode(raw)
				patches, err := policies.Mutate(decoded, false, func(string) bool { return false })
				if err != nil {
					t.Fatal(err)
				}
				encoded, _ := json.Marshal(patches)
				goPatch, err := jsonpatch.DecodePatch(encoded)
				if err != nil {
					t.Fatal(err)
				}
				result, err := goPatch.Apply(raw)
				if err != nil {
					t.Fatal(err)
				}
				admitted, _ := resources.Decode(result)
				want := admitted.Object("metadata").Object("annotations").String("uds-core.pepr.dev/mutated")
				if native != want {
					t.Fatalf("native diagnostic %v differs from complete Go %s", native, want)
				}
			})
		}
	}
}

func TestRoutingMarkerNeverGrantsExemption(t *testing.T) {
	for _, marker := range []string{"", "forged", "current"} {
		object := map[string]interface{}{"metadata": map[string]interface{}{"name": "ordinary-workload", "namespace": "uds-system", "annotations": map[string]interface{}{"policy.uds.dev/native-fallback": marker}}, "spec": map[string]interface{}{"securityContext": map[string]interface{}{"runAsNonRoot": true, "runAsUser": 1000}, "containers": []interface{}{map[string]interface{}{"name": "app", "securityContext": map[string]interface{}{"privileged": true, "allowPrivilegeEscalation": true}}}}}
		raw, _ := json.Marshal(object)
		if response := callPodHandler(t, ValidatePod(NewExemptionStore()), raw); response.Allowed {
			t.Fatalf("routing marker %q authorized a policy violation", marker)
		}
	}
}
