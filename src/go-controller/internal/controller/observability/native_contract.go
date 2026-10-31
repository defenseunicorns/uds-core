// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
package observability

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	nativeadmission "github.com/defenseunicorns/uds-core/src/go-controller/native-admission"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/client-go/tools/cache"
)

type nativeExpectation struct {
	Kind, Name, Fingerprint string
}

func expectedNativeContract() ([]nativeExpectation, error) {
	definitions, err := nativeadmission.Contract()
	if err != nil {
		return nil, fmt.Errorf("read native contract: %w", err)
	}
	if len(definitions) == 0 {
		return nil, errors.New("native contract is empty")
	}
	expected := make([]nativeExpectation, 0, len(definitions))
	seen := map[string]bool{}
	for _, definition := range definitions {
		kind, name := definition.Kind, definition.Metadata.Name
		key := kind + "/" + name
		if definition.APIVersion != "admissionregistration.k8s.io/v1" || !strings.HasPrefix(name, "uds-native-") || seen[key] {
			return nil, fmt.Errorf("invalid native contract identity %s", key)
		}
		fingerprint, err := nativeFingerprint(kind, definition.Spec)
		if err != nil {
			return nil, err
		}
		seen[key] = true
		expected = append(expected, nativeExpectation{kind, name, fingerprint})
	}
	for _, entry := range expected {
		peer := strings.TrimSuffix(entry.Kind, "Binding")
		if peer == entry.Kind {
			peer += "Binding"
		}
		if !seen[peer+"/"+entry.Name] {
			return nil, fmt.Errorf("native policy and binding pair incomplete: %s", entry.Name)
		}
	}
	return expected, nil
}

func (h *Health) policyStore(kind string) cache.Store {
	switch kind {
	case "ValidatingAdmissionPolicy":
		return h.sources.ValidatingPolicies
	case "MutatingAdmissionPolicy":
		return h.sources.MutatingPolicies
	case "ValidatingAdmissionPolicyBinding":
		return h.sources.ValidatingBindings
	case "MutatingAdmissionPolicyBinding":
		return h.sources.MutatingBindings
	}
	return nil
}

func (expected nativeExpectation) matches(value interface{}) bool {
	object, ok := value.(*unstructured.Unstructured)
	if !ok || object == nil || object.GetAPIVersion() != "admissionregistration.k8s.io/v1" || object.GetKind() != expected.Kind || object.GetNamespace() != "" || object.GetUID() == "" || object.GetDeletionTimestamp() != nil || object.GetGeneration() <= 0 {
		return false
	}
	spec, exists, err := unstructured.NestedMap(object.Object, "spec")
	if err != nil || !exists {
		return false
	}
	fingerprint, err := nativeFingerprint(expected.Kind, spec)
	if err != nil || fingerprint != expected.Fingerprint {
		return false
	}
	if expected.Kind != "ValidatingAdmissionPolicy" {
		// The MutatingAdmissionPolicy API has no persisted compilation status.
		return true
	}
	observed, _, err := unstructured.NestedInt64(object.Object, "status", "observedGeneration")
	if err != nil || observed != object.GetGeneration() {
		return false
	}
	_, compiled, err := unstructured.NestedMap(object.Object, "status", "typeChecking")
	warnings, _, warningErr := unstructured.NestedSlice(object.Object, "status", "typeChecking", "expressionWarnings")
	return compiled && err == nil && warningErr == nil && len(warnings) == 0
}

func nativeFingerprint(kind string, spec map[string]interface{}) (string, error) {
	if len(spec) == 0 {
		return "", errors.New("native definition has no spec")
	}
	copy := runtime.DeepCopyJSON(spec)
	matchField := "matchConstraints"
	switch kind {
	case "ValidatingAdmissionPolicy", "MutatingAdmissionPolicy":
		if _, exists := copy["failurePolicy"]; !exists {
			copy["failurePolicy"] = "Fail"
		}
	case "ValidatingAdmissionPolicyBinding", "MutatingAdmissionPolicyBinding":
		matchField = "matchResources"
	default:
		return "", fmt.Errorf("unsupported native contract kind %q", kind)
	}
	match, exists := copy[matchField].(map[string]interface{})
	if !exists {
		return "", fmt.Errorf("native %s has no %s", kind, matchField)
	}
	defaultMatchFields(match)
	raw, err := json.Marshal(copy)
	if err != nil {
		return "", err
	}
	digest := sha256.Sum256(raw)
	return hex.EncodeToString(digest[:]), nil
}

// Normalize only documented API defaults. Explicit rule, selector and expression
// changes remain part of the fingerprint, even if they retain the object names.
func defaultMatchFields(match map[string]interface{}) {
	for key, value := range map[string]interface{}{"matchPolicy": "Equivalent", "namespaceSelector": map[string]interface{}{}, "objectSelector": map[string]interface{}{}} {
		if _, exists := match[key]; !exists {
			match[key] = value
		}
	}
	for _, key := range []string{"resourceRules", "excludeResourceRules"} {
		list, _ := match[key].([]interface{})
		for _, entry := range list {
			if rule, ok := entry.(map[string]interface{}); ok {
				if _, exists := rule["scope"]; !exists {
					rule["scope"] = "*"
				}
			}
		}
	}
}
