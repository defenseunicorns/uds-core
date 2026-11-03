// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package policies

import (
	"bytes"
	"encoding/json"
	"github.com/defenseunicorns/uds-core/src/go-controller/internal/admission/resources"
	"github.com/google/cel-go/cel"
	"github.com/google/cel-go/ext"
	"os"
	"testing"
)

type nativeValidation struct {
	Variables   []struct{ Name, Expression string }
	Validations []struct{ Expression string }
}

func TestPublishedCELValidationsAgainstPinnedInputs(t *testing.T) {
	raw, err := os.ReadFile("../../../native-admission/policies.json")
	if err != nil {
		t.Fatal(err)
	}
	var generated struct {
		Items []struct {
			Kind     string
			Metadata struct{ Name string }
			Spec     nativeValidation
		}
	}
	if err = json.Unmarshal(raw, &generated); err != nil {
		t.Fatal(err)
	}
	names := []string{"DisallowHostNamespaces", "RestrictHostPorts", "DisallowPrivileged", "RequireNonRootUser", "RestrictProcMount", "RestrictSeccomp", "DisallowSELinuxOptions", "RestrictSELinuxType", "DropAllCapabilities", "RestrictCapabilities", "RestrictVolumeTypes", "RestrictHostPathWrite", "RestrictIstioSidecarOverrides", "RestrictIstioTrafficOverrides", "RestrictIstioAmbientOverrides", "RestrictIstioUser", "RestrictExternalNames", "DisallowNodePortServices"}
	env, err := cel.NewEnv(cel.Variable("object", cel.DynType), cel.Variable("request", cel.DynType), cel.Variable("params", cel.DynType), cel.Variable("variables", cel.DynType), ext.Strings())
	if err != nil {
		t.Fatal(err)
	}
	compile := func(expression string) cel.Program {
		ast, issues := env.Compile(expression)
		if issues.Err() != nil {
			t.Fatal(issues.Err())
		}
		program, err := env.Program(ast)
		if err != nil {
			t.Fatal(err)
		}
		return program
	}
	type compiled struct {
		vars        []string
		expressions []cel.Program
		validation  cel.Program
	}
	programs := map[string]compiled{}
	for _, policy := range generated.Items {
		if policy.Kind != "ValidatingAdmissionPolicy" || (policy.Metadata.Name != "uds-native-pod-profile" && policy.Metadata.Name != "uds-native-service-profile") {
			continue
		}
		offset, count := 0, 16
		if policy.Metadata.Name == "uds-native-service-profile" {
			offset, count = 16, 2
		}
		for i := 0; i < count; i++ {
			entry := compiled{validation: compile(policy.Spec.Validations[i].Expression)}
			for _, v := range policy.Spec.Variables {
				entry.vars = append(entry.vars, v.Name)
				entry.expressions = append(entry.expressions, compile(v.Expression))
			}
			programs[names[offset+i]] = entry
		}
	}
	raw, err = os.ReadFile("testdata/core-policy-parity.json")
	if err != nil {
		t.Fatal(err)
	}
	var fixture struct {
		Cases []struct {
			Name, Function string
			Args           []json.RawMessage
		}
	}
	if err = json.Unmarshal(raw, &fixture); err != nil {
		t.Fatal(err)
	}
	covered := map[string]int{}
	for _, test := range fixture.Cases {
		policy, object := validationFixture(test.Function, test.Args)
		if policy == "" {
			continue
		} // Image classification and mutation helpers belong to Go/live mutation tests.
		covered[policy]++
		t.Run(test.Function+"/"+test.Name, func(t *testing.T) {
			// Materialize only Kubernetes-valid absent fields before evaluating dyn CEL.
			if object.Object("metadata") == nil {
				object["metadata"] = json.RawMessage(`{}`)
			}
			if object.Object("spec") == nil {
				object["spec"] = json.RawMessage(`{}`)
			}
			encoded, _ := json.Marshal(object)
			var value map[string]interface{}
			decoder := json.NewDecoder(bytes.NewReader(encoded))
			decoder.UseNumber()
			decoder.Decode(&value)
			value = celNumbers(value).(map[string]interface{})
			spec := value["spec"].(map[string]interface{})
			if spec["containers"] == nil {
				spec["containers"] = []interface{}{}
			}
			for _, key := range []string{"containers", "initContainers", "ephemeralContainers"} {
				if containers, ok := spec[key].([]interface{}); ok {
					for _, item := range containers {
						if container, ok := item.(map[string]interface{}); ok {
							if _, exists := container["name"]; !exists {
								container["name"] = "app"
							}
							if ctx, exists := container["ctx"]; exists {
								container["securityContext"] = ctx
								delete(container, "ctx")
							}
						}
					}
				}
			}
			if volumes, ok := spec["volumes"].([]interface{}); ok {
				for _, item := range volumes {
					if volume, ok := item.(map[string]interface{}); ok {
						if _, exists := volume["name"]; !exists {
							volume["name"] = ""
						}
					}
				}
			}
			normalized, _ := json.Marshal(value)
			object, _ = resources.Decode(normalized)
			variables := map[string]interface{}{}
			activation := map[string]interface{}{"object": value, "variables": variables, "request": map[string]interface{}{"namespace": "apps", "subResource": ""}, "params": map[string]interface{}{"spec": map[string]interface{}{"revision": "current", "valid": true, "nativeMatchers": []interface{}{}}}}
			program := programs[policy]
			for i, expression := range program.expressions {
				v, _, err := expression.Eval(activation)
				if err != nil {
					t.Fatalf("variable %s: %v", program.vars[i], err)
				}
				variables[program.vars[i]] = v
			}
			got, _, err := program.validation.Eval(activation)
			if err != nil {
				t.Fatal(err)
			}
			expected := Validate(policy, object) == ""
			// These contextual policies explicitly delegate named Istio containers to Go.
			if v := variables["codeIdentity"]; v != nil && v.(interface{ Value() interface{} }).Value() == true && (policy == "RequireNonRootUser" || policy == "RestrictCapabilities" || policy == "RestrictIstioUser" || policy == "RestrictIstioTrafficOverrides") {
				expected = true
			}
			if got.Value() != expected {
				t.Fatalf("%s CEL=%v Go=%v input=%s", policy, got.Value(), expected, encoded)
			}
		})
	}
	for _, name := range names {
		if covered[name] == 0 {
			t.Errorf("validation %s has no pinned input coverage", name)
		}
	}
}
func celNumbers(v interface{}) interface{} {
	switch x := v.(type) {
	case json.Number:
		if i, err := x.Int64(); err == nil {
			return i
		}
		f, _ := x.Float64()
		return f
	case map[string]interface{}:
		for k, v := range x {
			x[k] = celNumbers(v)
		}
	case []interface{}:
		for i, v := range x {
			x[i] = celNumbers(v)
		}
	}
	return v
}
func validationFixture(name string, args []json.RawMessage) (string, resources.Object) {
	first := args[0]
	containers := map[string]string{"checkNoHostPorts": "RestrictHostPorts", "validatePrivilegeEscalation": "DisallowPrivileged", "validateProcMount": "RestrictProcMount", "findContainersWithoutDropAllCapability": "DropAllCapabilities", "validateContainerCapabilities": "RestrictCapabilities", "findContainerUsingIstioUserID": "RestrictIstioUser"}
	if policy := containers[name]; policy != "" {
		return policy, podWithContainers(first)
	}
	switch name {
	case "checkNoHostNamespaces":
		return "DisallowHostNamespaces", pod(first, nil)
	case "checkNotExternalNameService":
		return "RestrictExternalNames", pod(first, nil)
	case "checkNotNodePortService":
		return "DisallowNodePortServices", pod(first, nil)
	case "isRootSecurityContext":
		return "RequireNonRootUser", pod(json.RawMessage(`{"securityContext":`+string(first)+`}`), nil)
	case "isPodUsingIstioUserID":
		return "RestrictIstioUser", obj(first)
	case "validateSeccompProfile", "validateSELinuxOptions", "validateSELinuxTypes":
		policy := map[string]string{"validateSeccompProfile": "RestrictSeccomp", "validateSELinuxOptions": "DisallowSELinuxOptions", "validateSELinuxTypes": "RestrictSELinuxType"}[name]
		return policy, pod(json.RawMessage(`{"securityContext":`+string(first)+`,"containers":`+string(args[1])+`}`), nil)
	case "checkIstioAmbientOverrides":
		return "RestrictIstioAmbientOverrides", obj(first)
	case "checkIstioSidecarOverrides":
		return "RestrictIstioSidecarOverrides", obj(first)
	case "checkIstioTrafficInterceptionOverrides":
		o := obj(args[1])
		o["spec"] = json.RawMessage(`{"containers":` + string(first) + `}`)
		return "RestrictIstioTrafficOverrides", o
	case "validateVolumeTypes":
		return "RestrictVolumeTypes", pod(json.RawMessage(`{"volumes":`+string(first)+`}`), nil)
	case "validateHostPathVolumes":
		return "RestrictHostPathWrite", pod(json.RawMessage(`{"volumes":`+string(first)+`,"containers":`+string(args[1])+`}`), nil)
	}
	return "", nil
}
