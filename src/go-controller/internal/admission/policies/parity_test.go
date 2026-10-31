// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package policies

import (
	"encoding/json"
	"os"
	"reflect"
	"strings"
	"testing"

	"github.com/defenseunicorns/uds-core/src/go-controller/internal/admission/resources"
)

func TestPinnedPolicyHelperParity(t *testing.T) {
	raw, err := os.ReadFile("testdata/core-policy-parity.json")
	if err != nil {
		t.Fatal(err)
	}
	var fixture struct {
		SourceRevision string `json:"sourceRevision"`
		Cases          []struct {
			Name, Function string
			Args, After    []json.RawMessage
			Result         json.RawMessage
		} `json:"cases"`
	}
	if err := json.Unmarshal(raw, &fixture); err != nil {
		t.Fatal(err)
	}
	if fixture.SourceRevision != "c15677633cffa17e99656a7d7ccd1f98d7cb6e4d" || len(fixture.Cases) != 182 {
		t.Fatalf("incomplete reference: %s %d cases", fixture.SourceRevision, len(fixture.Cases))
	}
	for _, test := range fixture.Cases {
		t.Run(test.Function+"/"+test.Name, func(t *testing.T) {
			result, after, err := helperResult(test.Function, test.Args)
			if err != nil {
				t.Fatal(err)
			}
			if after != nil {
				assertJSON(t, test.After[0], after, "mutation")
			}
			assertJSON(t, test.Result, result, "return")
		})
	}
}

func assertJSON(t *testing.T, expected json.RawMessage, actual interface{}, label string) {
	t.Helper()
	raw, err := json.Marshal(actual)
	if err != nil {
		t.Fatal(err)
	}
	var left, right interface{}
	if err := json.Unmarshal(expected, &left); err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(raw, &right); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(left, right) {
		t.Errorf("%s mismatch: reference %s; Go %s", label, expected, raw)
	}
}

func obj(raw json.RawMessage) resources.Object { object, _ := resources.Decode(raw); return object }
func list(raw json.RawMessage) []resources.Object {
	var result []resources.Object
	_ = json.Unmarshal(raw, &result)
	return result
}
func textArg(raw json.RawMessage) string {
	var value string
	_ = json.Unmarshal(raw, &value)
	return value
}
func allowedArg(raw json.RawMessage) ([]string, bool) {
	var values []*string
	_ = json.Unmarshal(raw, &values)
	allowed, missing := []string{}, false
	for _, value := range values {
		if value == nil {
			missing = true
		} else {
			allowed = append(allowed, *value)
		}
	}
	return allowed, missing
}
func pod(spec, metadata json.RawMessage) resources.Object {
	if len(spec) == 0 || string(spec) == "null" {
		spec = json.RawMessage(`{}`)
	}
	if len(metadata) == 0 || string(metadata) == "null" {
		metadata = json.RawMessage(`{}`)
	}
	return resources.Object{"spec": spec, "metadata": metadata}
}
func podWithContainers(raw json.RawMessage) resources.Object {
	return pod(json.RawMessage(`{"containers":`+string(raw)+`}`), nil)
}

func helperResult(name string, args []json.RawMessage) (interface{}, interface{}, error) {
	first := args[0]
	switch name {
	case "parseImageRef":
		registry, repository, valid := ParseImageRef(textArg(first))
		if !valid {
			return nil, nil, nil
		}
		return map[string]string{"registry": registry, "repository": repository}, nil, nil
	case "validateIstioImage":
		return ValidateIstioImage(textArg(first)), nil, nil
	case "isIstioProxyContainer":
		return IsIstioProxy(obj(first)), nil, nil
	case "isIstioInitContainer":
		request := obj(first)
		object := request.Object("Raw")
		if request.Bool("annotation") {
			metadata := object.Object("metadata")
			if metadata == nil {
				metadata = resources.Object{}
			}
			metadata["annotations"] = json.RawMessage(`{"sidecar.istio.io/status":"{}"}`)
			raw, _ := json.Marshal(metadata)
			object["metadata"] = raw
		}
		return IsIstioInit(object, obj(args[1])), nil, nil
	case "isRootSecurityContext":
		return IsRoot(obj(first)), nil, nil
	case "validatePrivilegeEscalation":
		return PrivilegeViolations(list(first)), nil, nil
	case "validateProcMount":
		allowed, _ := allowedArg(args[1])
		return ProcMountViolations(list(first), allowed), nil, nil
	case "validateSeccompProfile":
		allowed, missing := allowedArg(args[2])
		return ProfileViolations(obj(first), list(args[1]), "seccompProfile", "type", allowed, missing), nil, nil
	case "validateSELinuxOptions":
		return SELinuxOptionsViolations(obj(first), list(args[1])), nil, nil
	case "validateSELinuxTypes":
		allowed, missing := allowedArg(args[2])
		return ProfileViolations(obj(first), list(args[1]), "seLinuxOptions", "type", allowed, missing), nil, nil
	case "findContainersWithoutDropAllCapability":
		return DropViolations(list(first), textArg(args[1])), nil, nil
	case "validateContainerCapabilities":
		allowed, _ := allowedArg(args[1])
		return CapabilityViolations(list(first), allowed), nil, nil
	case "setNonRootUserSettings":
		object := pod(first, args[1])
		mutated, err := applyPatches(object, DefaultNonRoot(object))
		return nil, mutated.Object("spec"), err
	case "setPrivilegeEscalation", "setAllContainersDropAllCapabilities":
		object := podWithContainers(first)
		patches, changed := containerDefaults(object, name == "setAllContainersDropAllCapabilities")
		mutated, err := applyPatches(object, patches)
		var result interface{}
		if name == "setPrivilegeEscalation" {
			result = changed
		}
		return result, mutated.Object("spec").List("containers"), err
	case "checkNoHostNamespaces":
		return Validate("DisallowHostNamespaces", pod(first, nil)) == "", nil, nil
	case "checkNoHostPorts":
		return Validate("RestrictHostPorts", podWithContainers(first)) == "", nil, nil
	case "checkNotExternalNameService":
		return Validate("RestrictExternalNames", pod(first, nil)) == "", nil, nil
	case "checkNotNodePortService":
		return Validate("DisallowNodePortServices", pod(first, nil)) == "", nil, nil
	case "isPodUsingIstioUserID":
		ctx := obj(first).Object("spec").Object("securityContext")
		return ctx.Number("runAsUser") == 1337 || ctx.Number("runAsGroup") == 1337 || ctx.Number("fsGroup") == 1337 || HasNumber(ctx.Numbers("supplementalGroups"), 1337), nil, nil
	case "findContainerUsingIstioUserID":
		for _, container := range list(first) {
			ctx := container.Object("securityContext")
			if !IsIstioProxy(container) && (ctx.Number("runAsUser") == 1337 || ctx.Number("runAsGroup") == 1337) {
				return container.String("name"), nil, nil
			}
		}
		return nil, nil, nil
	case "checkIstioAmbientOverrides", "checkIstioSidecarOverrides", "checkIstioTrafficInterceptionOverrides":
		policy := "RestrictIstioAmbientOverrides"
		object := obj(first)
		if name == "checkIstioSidecarOverrides" {
			policy = "RestrictIstioSidecarOverrides"
		}
		if name == "checkIstioTrafficInterceptionOverrides" {
			policy = "RestrictIstioTrafficOverrides"
			object = obj(args[1])
			object["spec"] = json.RawMessage(`{"containers":` + string(first) + `}`)
		}
		message := Validate(policy, object)
		if message == "" {
			return []string{}, nil, nil
		}
		return strings.Split(strings.SplitN(message, ": ", 2)[1], ", "), nil, nil
	case "validateVolumeTypes", "validateHostPathVolumes":
		spec := json.RawMessage(`{"volumes":` + string(first) + `}`)
		policy := "RestrictVolumeTypes"
		if name == "validateHostPathVolumes" {
			policy = "RestrictHostPathWrite"
			spec = json.RawMessage(`{"volumes":` + string(first) + `,"containers":` + string(args[1]) + `}`)
		}
		message := Validate(policy, pod(spec, nil))
		if message == "" {
			return []interface{}{true, nil}, nil, nil
		}
		if policy == "RestrictVolumeTypes" {
			parts := strings.Split(message, " ")
			kind := strings.Trim(parts[len(parts)-1], "'.")
			return []interface{}{false, map[string]string{"name": parts[1], "type": kind}}, nil, nil
		}
		return []interface{}{false, map[string]string{"name": strings.Split(message, "'")[1]}}, nil, nil
	}
	return nil, nil, &unknownHelper{name}
}

type unknownHelper struct{ name string }

func (u *unknownHelper) Error() string { return "uncaptured helper adapter " + u.name }
