// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package policies

import (
	"encoding/json"
	"fmt"
	jsonpatch "gopkg.in/evanphx/json-patch.v4"
	"math/big"
	"strings"

	"github.com/defenseunicorns/uds-core/src/go-controller/internal/admission/exemptions"
	"github.com/defenseunicorns/uds-core/src/go-controller/internal/admission/resources"
)

type Patch struct {
	Op    string      `json:"op"`
	Path  string      `json:"path"`
	Value interface{} `json:"value,omitempty"`
}

const exemptionPrefix = "uds-core.pepr.dev/uds-core-policies."
const mutationAnnotation = "uds-core.pepr.dev/mutated"

// ParseInt implements ECMAScript parseInt without executing JavaScript. Invalid
// numbers become JSON null exactly as JSON.stringify serializes NaN.
func ParseInt(value string) interface{} {
	value = strings.TrimLeftFunc(value, jsWhitespace)
	negative := false
	if strings.HasPrefix(value, "+") || strings.HasPrefix(value, "-") {
		negative = value[0] == '-'
		value = value[1:]
	}
	base := 10
	if strings.HasPrefix(value, "0x") || strings.HasPrefix(value, "0X") {
		base = 16
		value = value[2:]
	}
	length := 0
	for _, digit := range value {
		if digit >= '0' && digit <= '9' || base == 16 && (digit >= 'a' && digit <= 'f' || digit >= 'A' && digit <= 'F') {
			length++
		} else {
			break
		}
	}
	if length == 0 {
		return json.RawMessage("null")
	}
	integer, valid := new(big.Int).SetString(value[:length], base)
	if !valid {
		return json.RawMessage("null")
	}
	if negative {
		integer.Neg(integer)
	}
	number, _ := new(big.Float).SetInt(integer).Float64()
	return number
}

func DefaultNonRoot(pod resources.Object) []Patch {
	spec, metadata := pod.Object("spec"), pod.Object("metadata")
	context := spec.Object("securityContext")
	var patches []Patch
	if context == nil {
		context = resources.Object{}
		patches = append(patches, Patch{Op: "add", Path: "/spec/securityContext", Value: map[string]interface{}{}})
	}
	labels := metadata.Object("labels")
	for label, field := range map[string]string{"uds/user": "runAsUser", "uds/group": "runAsGroup", "uds/fsgroup": "fsGroup"} {
		if labels.Truthy(label) {
			value := ParseInt(labels.String(label))
			raw, _ := json.Marshal(value)
			if string(context[field]) != string(raw) {
				patches = append(patches, Patch{Op: "add", Path: "/spec/securityContext/" + field, Value: value})
			}
			context[field] = raw
		}
	}
	for _, field := range []string{"runAsNonRoot", "runAsUser", "runAsGroup"} {
		if context.Has(field) {
			continue
		}
		value := interface{}(1000)
		if field == "runAsNonRoot" {
			value = true
		}
		patches = append(patches, Patch{Op: "add", Path: "/spec/securityContext/" + field, Value: value})
	}
	return patches
}

func Mutate(object resources.Object, service bool, exempt func(string) bool) ([]Patch, error) {
	metadata := object.Object("metadata")
	annotations := metadata.Object("annotations")
	var mutated *mutationDiagnostics
	if !service {
		var err error
		mutated, err = parseDiagnostics(annotations.String(mutationAnnotation))
		if err != nil {
			return nil, err
		}
	}
	updatedAnnotations := map[string]string{}
	removedAnnotations := []string{}
	for _, policy := range exemptions.Policies {
		isService := policy == "RestrictExternalNames" || policy == "DisallowNodePortServices"
		if service != isService {
			continue
		}
		key := exemptionPrefix + policy
		if exempt(policy) {
			updatedAnnotations[key] = "exempted"
		} else if annotations.Has(key) {
			removedAnnotations = append(removedAnnotations, key)
		}
	}
	var patches []Patch
	if !service {
		if !exempt("DisallowPrivileged") {
			privilege, changed := containerDefaults(object, false)
			patches = append(patches, privilege...)
			if changed {
				mutated.add("disallow-privileged")
			}
			var err error
			object, err = applyPatches(object, privilege)
			if err != nil {
				return nil, err
			}
		}
		if !exempt("RequireNonRootUser") {
			defaults := DefaultNonRoot(object)
			patches = append(patches, defaults...)
			mutated.add("require-non-root-user")
			var err error
			object, err = applyPatches(object, defaults)
			if err != nil {
				return nil, err
			}
		}
		if !exempt("DropAllCapabilities") {
			drop, _ := containerDefaults(object, true)
			patches = append(patches, drop...)
			mutated.add("drop-all-capabilities")
		}
		if mutated.length() > 0 {
			updatedAnnotations[mutationAnnotation] = mutated.text()
		}
	}
	if annotations == nil && len(updatedAnnotations) > 0 {
		patches = append(patches, Patch{Op: "add", Path: "/metadata/annotations", Value: map[string]string{}})
	}
	for key, value := range updatedAnnotations {
		if annotations.String(key) != value {
			patches = append(patches, Patch{Op: "add", Path: "/metadata/annotations/" + jsonPointer(key), Value: value})
		}
	}
	for _, key := range removedAnnotations {
		patches = append(patches, Patch{Op: "remove", Path: "/metadata/annotations/" + jsonPointer(key)})
	}
	return patches, nil
}

func applyPatches(object resources.Object, patches []Patch) (resources.Object, error) {
	if len(patches) == 0 {
		return object, nil
	}
	raw, err := json.Marshal(object)
	if err != nil {
		return nil, err
	}
	ops, err := json.Marshal(patches)
	if err != nil {
		return nil, err
	}
	patch, err := jsonpatch.DecodePatch(ops)
	if err != nil {
		return nil, err
	}
	mutated, err := patch.Apply(raw)
	if err != nil {
		return nil, err
	}
	return resources.Decode(mutated)
}

func jsonPointer(value string) string {
	return strings.ReplaceAll(strings.ReplaceAll(value, "~", "~0"), "/", "~1")
}

func containerDefaults(object resources.Object, drop bool) ([]Patch, bool) {
	var patches []Patch
	changed := false
	for _, field := range []string{"containers", "initContainers", "ephemeralContainers"} {
		for index, container := range object.Object("spec").List(field) {
			path := fmt.Sprintf("/spec/%s/%d/securityContext", field, index)
			context := container.Object("securityContext")
			if context == nil {
				patches = append(patches, Patch{Op: "add", Path: path, Value: map[string]interface{}{}})
				context = resources.Object{}
			}
			capabilities := context.Object("capabilities")
			if drop {
				if capabilities == nil {
					patches = append(patches, Patch{Op: "add", Path: path + "/capabilities", Value: map[string]interface{}{}})
				}
				values := capabilities.Strings("drop")
				if len(values) != 1 || values[0] != "ALL" {
					patches = append(patches, Patch{Op: "add", Path: path + "/capabilities/drop", Value: []string{"ALL"}})
					changed = true
				}
			} else if !context.Has("allowPrivilegeEscalation") && !context.Bool("privileged") && !HasString(capabilities.Strings("add"), "CAP_SYS_ADMIN") {
				patches = append(patches, Patch{Op: "add", Path: path + "/allowPrivilegeEscalation", Value: false})
				changed = true
			}
		}
	}
	return patches, changed
}
