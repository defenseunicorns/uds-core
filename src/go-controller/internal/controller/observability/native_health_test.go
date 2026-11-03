// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
package observability

import (
	"testing"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
)

func nativeGauge(t *testing.T, h *Health, expected float64) {
	t.Helper()
	if got := values(t, h.registry)["uds_native_policies_active"]; got != expected {
		t.Fatalf("native capability=%v, want %v", got, expected)
	}
}

func TestEveryNativePolicyAndBindingMustExistAndRecover(t *testing.T) {
	h, _, _, _ := healthy(t)
	for _, entry := range h.contract {
		t.Run(entry.Kind+"/"+entry.Name, func(t *testing.T) {
			h, _, _, _ := healthy(t)
			store := h.policyStore(entry.Kind)
			obj, exists, err := store.GetByKey(entry.Name)
			if err != nil || !exists {
				t.Fatal("test requires a real contract object", err)
			}
			nativeGauge(t, h, 1)
			_ = store.Delete(obj)
			nativeGauge(t, h, 0)
			_ = store.Add(obj)
			nativeGauge(t, h, 1)
		})
	}
}

func TestNativeDefinitionAndBindingDriftFailClosedUntilActualRestoration(t *testing.T) {
	checks := []struct {
		name, kind, target string
		change             func(*unstructured.Unstructured)
	}{
		{"policy-validation", "ValidatingAdmissionPolicy", "uds-native-pod-profile", func(o *unstructured.Unstructured) {
			_ = unstructured.SetNestedSlice(o.Object, []interface{}{map[string]interface{}{"expression": "true"}}, "spec", "validations")
		}},
		{"policy-disabled-condition", "ValidatingAdmissionPolicy", "uds-native-pod-profile", func(o *unstructured.Unstructured) {
			_ = unstructured.SetNestedSlice(o.Object, []interface{}{map[string]interface{}{"name": "disabled", "expression": "false"}}, "spec", "matchConditions")
		}},
		{"policy-failure-ignore", "ValidatingAdmissionPolicy", "uds-native-pod-profile", func(o *unstructured.Unstructured) {
			_ = unstructured.SetNestedField(o.Object, "Ignore", "spec", "failurePolicy")
		}},
		{"mutator-failure-ignore", "MutatingAdmissionPolicy", "uds-native-defaults-profile", func(o *unstructured.Unstructured) {
			_ = unstructured.SetNestedField(o.Object, "Ignore", "spec", "failurePolicy")
		}},
		{"mutator-removed", "MutatingAdmissionPolicy", "uds-native-defaults-profile", func(o *unstructured.Unstructured) {
			_ = unstructured.SetNestedSlice(o.Object, []interface{}{}, "spec", "mutations")
		}},
		{"policy-rule-removed", "ValidatingAdmissionPolicy", "uds-native-pod-profile", func(o *unstructured.Unstructured) {
			_ = unstructured.SetNestedSlice(o.Object, []interface{}{}, "spec", "matchConstraints", "resourceRules")
		}},
		{"binding-narrow-namespace", "ValidatingAdmissionPolicyBinding", "uds-native-pod-profile", narrowNamespace},
		{"mutator-narrow-namespace", "MutatingAdmissionPolicyBinding", "uds-native-defaults-profile", narrowNamespace},
		{"binding-narrow-object", "ValidatingAdmissionPolicyBinding", "uds-native-pod-profile", func(o *unstructured.Unstructured) {
			_ = unstructured.SetNestedMap(o.Object, map[string]interface{}{"matchLabels": map[string]interface{}{"never-selected": "true"}}, "spec", "matchResources", "objectSelector")
		}},
		{"binding-misbound", "ValidatingAdmissionPolicyBinding", "uds-native-pod-profile", func(o *unstructured.Unstructured) {
			_ = unstructured.SetNestedField(o.Object, "another-policy", "spec", "policyName")
		}},
		{"binding-nondeny", "ValidatingAdmissionPolicyBinding", "uds-native-pod-profile", func(o *unstructured.Unstructured) {
			_ = unstructured.SetNestedStringSlice(o.Object, []string{"Warn"}, "spec", "validationActions")
		}},
		{"missing-param-ref", "ValidatingAdmissionPolicyBinding", "uds-native-pod-profile", func(o *unstructured.Unstructured) {
			unstructured.RemoveNestedField(o.Object, "spec", "paramRef")
		}},
		{"wrong-param-ref", "MutatingAdmissionPolicyBinding", "uds-native-defaults-profile", func(o *unstructured.Unstructured) {
			_ = unstructured.SetNestedField(o.Object, "untrusted", "spec", "paramRef", "namespace")
		}},
		{"missing-param-allows", "ValidatingAdmissionPolicyBinding", "uds-native-pod-profile", func(o *unstructured.Unstructured) {
			_ = unstructured.SetNestedField(o.Object, "Allow", "spec", "paramRef", "parameterNotFoundAction")
		}},
		{"uncompiled-policy", "ValidatingAdmissionPolicy", "uds-native-pod-profile", func(o *unstructured.Unstructured) {
			unstructured.RemoveNestedField(o.Object, "status")
		}},
		{"stale-policy-compilation", "ValidatingAdmissionPolicy", "uds-native-pod-profile", func(o *unstructured.Unstructured) { o.SetGeneration(2) }},
		{"missing-typechecking", "ValidatingAdmissionPolicy", "uds-native-pod-profile", func(o *unstructured.Unstructured) {
			unstructured.RemoveNestedField(o.Object, "status", "typeChecking")
		}},
		{"typechecking-warning", "ValidatingAdmissionPolicy", "uds-native-pod-profile", func(o *unstructured.Unstructured) {
			_ = unstructured.SetNestedSlice(o.Object, []interface{}{map[string]interface{}{"fieldRef": "spec.validations[0].expression", "warning": "undeclared reference"}}, "status", "typeChecking", "expressionWarnings")
		}},
		{"deleted-policy", "ValidatingAdmissionPolicy", "uds-native-pod-profile", func(o *unstructured.Unstructured) { stamp := metav1.Now(); o.SetDeletionTimestamp(&stamp) }},
		{"deleted-binding", "MutatingAdmissionPolicyBinding", "uds-native-defaults-profile", func(o *unstructured.Unstructured) { stamp := metav1.Now(); o.SetDeletionTimestamp(&stamp) }},
	}
	for _, check := range checks {
		t.Run(check.name, func(t *testing.T) {
			h, _, _, _ := healthy(t)
			store := h.policyStore(check.kind)
			original, _, _ := store.GetByKey(check.target)
			changed := original.(*unstructured.Unstructured).DeepCopy()
			check.change(changed)
			_ = store.Update(changed)
			nativeGauge(t, h, 0)
			_ = store.Update(original)
			nativeGauge(t, h, 1)
		})
	}
}

func narrowNamespace(o *unstructured.Unstructured) {
	_ = unstructured.SetNestedMap(o.Object, map[string]interface{}{"matchLabels": map[string]interface{}{"kubernetes.io/metadata.name": "unused-qualification-only"}}, "spec", "matchResources", "namespaceSelector")
}

func TestDocumentedAPIDefaultsAndCurrentCompilationRemainHealthy(t *testing.T) {
	h, _, _, _ := healthy(t)
	for _, entry := range h.contract {
		store := h.policyStore(entry.Kind)
		value, _, _ := store.GetByKey(entry.Name)
		object := value.(*unstructured.Unstructured).DeepCopy()
		field := "matchConstraints"
		if entry.Kind == "ValidatingAdmissionPolicyBinding" || entry.Kind == "MutatingAdmissionPolicyBinding" {
			field = "matchResources"
		}
		_ = unstructured.SetNestedField(object.Object, "Equivalent", "spec", field, "matchPolicy")
		for _, key := range []string{"namespaceSelector", "objectSelector"} {
			if _, exists, _ := unstructured.NestedMap(object.Object, "spec", field, key); !exists {
				_ = unstructured.SetNestedMap(object.Object, map[string]interface{}{}, "spec", field, key)
			}
		}
		for _, key := range []string{"resourceRules", "excludeResourceRules"} {
			list, exists, _ := unstructured.NestedSlice(object.Object, "spec", field, key)
			for _, rule := range list {
				rule.(map[string]interface{})["scope"] = "*"
			}
			if exists {
				_ = unstructured.SetNestedSlice(object.Object, list, "spec", field, key)
			}
		}
		_ = store.Update(object)
	}
	nativeGauge(t, h, 1)
	value, _, _ := h.sources.ValidatingPolicies.GetByKey("uds-native-pod-profile")
	object := value.(*unstructured.Unstructured).DeepCopy()
	object.SetGeneration(2)
	_ = unstructured.SetNestedField(object.Object, int64(2), "status", "observedGeneration")
	_ = h.sources.ValidatingPolicies.Update(object)
	nativeGauge(t, h, 1)
}
