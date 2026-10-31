// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package exemptions

import (
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"reflect"
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

func TestLegacyRevisionTracksPatternsAndRetainedOwners(t *testing.T) {
	first := grant("a", ProtectedNamespace, "(?<=job-)worker", "pod", "RequireNonRootUser")
	second := grant("b", ProtectedNamespace, "(?<=job-)worker", "pod", "RequireNonRootUser")
	compile := func(objects ...*unstructured.Unstructured) Parameters {
		t.Helper()
		parameters, err := Compile(objects, false)
		if err != nil {
			t.Fatal(err)
		}
		return parameters
	}
	both, reordered, retained := compile(first, second), compile(second, first), compile(second)
	if both.Revision != reordered.Revision || both.Revision == retained.Revision || !reflect.DeepEqual(both.LegacyScopes, retained.LegacyScopes) {
		t.Fatal("legacy OR-union revision ignored owner revocation or depended on input order")
	}
	changed := compile(grant("b", ProtectedNamespace, "(?<=task-)worker", "pod", "RequireNonRootUser"))
	if changed.Revision == retained.Revision || !reflect.DeepEqual(changed.LegacyScopes, retained.LegacyScopes) {
		t.Fatal("legacy expression changed without a new authority revision")
	}
}

func TestCompileUnionAndRevocation(t *testing.T) {
	first := grant("a", ProtectedNamespace, "^one-.*$", "pod", "DisallowPrivileged")
	second := grant("b", ProtectedNamespace, "^two-.*$", "pod", "DisallowPrivileged")
	before, err := Compile([]*unstructured.Unstructured{first, second}, false)
	if err != nil {
		t.Fatal(err)
	}
	if len(before.NativeMatchers) != 2 || len(before.LegacyScopes) != 0 {
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

func TestCompilePreservesLegacyRegexBoundary(t *testing.T) {
	for _, pattern := range []string{"(?<=job-)worker", `(job)-\1`, `\p{L}+`} {
		compiled, err := Compile([]*unstructured.Unstructured{grant("a", ProtectedNamespace, pattern, "pod", "RequireNonRootUser")}, false)
		if err != nil {
			t.Fatal(err)
		}
		if len(compiled.NativeMatchers) != 0 || len(compiled.LegacyScopes) != 1 {
			t.Fatalf("%q was silently reinterpreted as native", pattern)
		}
	}
}

func TestCompileTrustKindAndMalformedInput(t *testing.T) {
	for _, object := range []*unstructured.Unstructured{
		grant("a", "tenant", ".*", "pod", "DisallowPrivileged"),
		grant("a", ProtectedNamespace, ".*", "service", "DisallowPrivileged"),
		grant("a", ProtectedNamespace, "[", "pod", "DisallowPrivileged"),
		grant("a", ProtectedNamespace, ".*", "pod", "Unknown"),
	} {
		if _, err := Compile([]*unstructured.Unstructured{object}, false); err == nil {
			t.Fatal("invalid grant was accepted")
		}
	}
	empty, err := Compile(nil, false)
	if err != nil || empty.NativeMatchers == nil || empty.LegacyScopes == nil {
		t.Fatal("empty snapshot must remain an explicit enforcing input")
	}
}
