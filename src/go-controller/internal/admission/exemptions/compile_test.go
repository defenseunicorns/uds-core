// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package exemptions

import (
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"testing"
)

func grant(uid, namespace, pattern, kind, policy string) *unstructured.Unstructured {
	return &unstructured.Unstructured{Object: map[string]interface{}{
		"apiVersion": "uds.dev/v1alpha1", "kind": "Exemption",
		"metadata": map[string]interface{}{"uid": uid, "namespace": namespace, "name": uid},
		"spec": map[string]interface{}{"exemptions": []interface{}{map[string]interface{}{
			"policies": []interface{}{policy}, "matcher": map[string]interface{}{"namespace": "app", "name": pattern, "kind": kind},
		}}},
	}}
}

func TestCompileUnionAndRevocation(t *testing.T) {
	first := grant("a", ProtectedNamespace, "^one-.*$", "pod", "DisallowPrivileged")
	second := grant("b", ProtectedNamespace, "^two-.*$", "pod", "DisallowPrivileged")
	before, err := Compile([]*unstructured.Unstructured{first, second}, false)
	if err != nil {
		t.Fatal(err)
	}
	if len(before.NativeMatchers) != 2 {
		t.Fatal("grants did not form a native union")
	}
	after, err := Compile([]*unstructured.Unstructured{second}, false)
	if err != nil {
		t.Fatal(err)
	}
	if len(after.NativeMatchers) != 1 || after.NativeMatchers[0].Owner != "b" || before.Revision == after.Revision {
		t.Fatal("revocation retained the old grant or revision")
	}
	reordered, err := Compile([]*unstructured.Unstructured{second, first}, false)
	if err != nil || reordered.Revision != before.Revision {
		t.Fatal("input order changed the union revision")
	}
}

func TestCompileDegradesOnlyInvalidMatcher(t *testing.T) {
	good := grant("good", ProtectedNamespace, "prometheus", "pod", "RequireNonRootUser")
	bad := grant("bad", ProtectedNamespace, "(?<=job-)worker", "pod", "RequireNonRootUser")
	entries, _, _ := unstructured.NestedSlice(good.Object, "spec", "exemptions")
	invalid, _, _ := unstructured.NestedSlice(bad.Object, "spec", "exemptions")
	entries = append(entries, invalid...)
	_ = unstructured.SetNestedSlice(good.Object, entries, "spec", "exemptions")
	result, err := Compile([]*unstructured.Unstructured{good}, false)
	if err != nil || !result.Valid || len(result.NativeMatchers) != 1 || len(result.InvalidMatchers) != 1 {
		t.Fatalf("snapshot = %+v, %v", result, err)
	}
	if result.InvalidMatchers[0].Index != 1 || result.InvalidMatchers[0].Name != "good" {
		t.Fatal("missing offending matcher identity")
	}
	if !result.NativeMatchers[0].Compiled.MatchString("kube-prometheus-stack-operator") {
		t.Fatal("matcher acquired implicit anchors")
	}
}
func TestCompileSharesExpressionAcrossPolicies(t *testing.T) {
	object := grant("a", ProtectedNamespace, "", "pod", "DisallowPrivileged")
	entries, _, _ := unstructured.NestedSlice(object.Object, "spec", "exemptions")
	entries[0].(map[string]interface{})["policies"] = []interface{}{"DisallowPrivileged", "RequireNonRootUser"}
	_ = unstructured.SetNestedSlice(object.Object, entries, "spec", "exemptions")
	result, err := Compile([]*unstructured.Unstructured{object}, false)
	if err != nil || len(result.NativeMatchers) != 2 {
		t.Fatalf("%+v %v", result, err)
	}
	if result.NativeMatchers[0].Compiled != result.NativeMatchers[1].Compiled {
		t.Fatal("compiled per policy instead of per matcher")
	}
	if !result.NativeMatchers[0].Compiled.MatchString("") {
		t.Fatal("empty pattern must match everything")
	}
}

func TestCompileTrustKindAndMalformedInput(t *testing.T) {
	for _, object := range []*unstructured.Unstructured{
		grant("a", "tenant", ".*", "pod", "DisallowPrivileged"),
		grant("a", ProtectedNamespace, ".*", "service", "DisallowPrivileged"),
		grant("a", ProtectedNamespace, ".*", "pod", "Unknown"),
	} {
		if _, err := Compile([]*unstructured.Unstructured{object}, false); err == nil {
			t.Fatal("invalid grant was accepted")
		}
	}
	empty, err := Compile(nil, false)
	if err != nil || empty.NativeMatchers == nil {
		t.Fatal("empty snapshot must remain an explicit enforcing input")
	}
}
