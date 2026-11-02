// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package admission

import (
	"context"
	"encoding/json"
	compiled "github.com/defenseunicorns/uds-core/src/go-controller/internal/admission/exemptions"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	dynamicfake "k8s.io/client-go/dynamic/fake"
	ktesting "k8s.io/client-go/testing"
	"k8s.io/client-go/tools/cache"
	"testing"
)

func TestCompilerPublishesRevocationOnInvalidInput(t *testing.T) {
	client := dynamicfake.NewSimpleDynamicClient(runtime.NewScheme())
	var published compiled.Parameters
	client.PrependReactor("patch", "admissionparameters", func(action ktesting.Action) (bool, runtime.Object, error) {
		patch := action.(ktesting.PatchAction)
		var body struct{ Spec compiled.Parameters }
		if err := json.Unmarshal(patch.GetPatch(), &body); err != nil {
			t.Fatal(err)
		}
		if action.GetNamespace() != compiled.ProtectedNamespace || patch.GetName() != "uds-native-grants" {
			t.Fatal("compiler published a second grant object")
		}
		published = body.Spec
		return true, &unstructured.Unstructured{Object: map[string]interface{}{"apiVersion": "policy.uds.dev/v1alpha1", "kind": "AdmissionParameters"}}, nil
	})
	informer := cache.NewSharedIndexInformer(nil, &unstructured.Unstructured{}, 0, cache.Indexers{})
	compiler := NewCompiler(client, informer)
	grant := &unstructured.Unstructured{Object: map[string]interface{}{"apiVersion": "uds.dev/v1alpha1", "kind": "Exemption", "metadata": map[string]interface{}{"name": "grant", "namespace": compiled.ProtectedNamespace, "uid": "grant-uid"}, "spec": map[string]interface{}{"exemptions": []interface{}{map[string]interface{}{"matcher": map[string]interface{}{"namespace": "app", "name": "^trusted-.*$", "kind": "pod"}, "policies": []interface{}{"DisallowPrivileged"}}}}}}
	if err := informer.GetStore().Add(grant); err != nil {
		t.Fatal(err)
	}
	if err := compiler.Publish(context.Background()); err != nil {
		t.Fatal(err)
	}
	if !published.Valid || len(published.NativeMatchers) != 1 {
		t.Fatal("valid snapshot did not authorize exact grant")
	}
	invalid := grant.DeepCopy()
	invalid.SetNamespace("untrusted")
	if err := informer.GetStore().Add(invalid); err != nil {
		t.Fatal(err)
	}
	if err := compiler.Publish(context.Background()); err == nil {
		t.Fatal("invalid input did not surface error")
	}
	if published.Valid || len(published.NativeMatchers) != 0 {
		t.Fatal("invalid input retained old authorization")
	}
	if err := informer.GetStore().Delete(invalid); err != nil {
		t.Fatal(err)
	}
	if err := informer.GetStore().Delete(grant); err != nil {
		t.Fatal(err)
	}
	if err := compiler.Publish(context.Background()); err != nil {
		t.Fatal(err)
	}
	if !published.Valid || len(published.NativeMatchers) != 0 || published.Revision == "invalid-input" {
		t.Fatal("empty repaired snapshot did not restore enforcing admission")
	}
}

func TestCompilerPublishesHealthyUnionAndWarningForInvalidMatcher(t *testing.T) {
	client := dynamicfake.NewSimpleDynamicClient(runtime.NewScheme())
	var published map[string]interface{}
	client.PrependReactor("patch", "admissionparameters", func(action ktesting.Action) (bool, runtime.Object, error) {
		if err := json.Unmarshal(action.(ktesting.PatchAction).GetPatch(), &published); err != nil {
			t.Fatal(err)
		}
		return true, &unstructured.Unstructured{Object: published}, nil
	})
	informer := cache.NewSharedIndexInformer(nil, &unstructured.Unstructured{}, 0, cache.Indexers{})
	object := &unstructured.Unstructured{Object: map[string]interface{}{
		"apiVersion": "uds.dev/v1alpha1", "kind": "Exemption",
		"metadata": map[string]interface{}{"name": "partial", "namespace": compiled.ProtectedNamespace, "uid": "partial-uid"},
		"spec": map[string]interface{}{"exemptions": []interface{}{
			map[string]interface{}{"matcher": map[string]interface{}{"namespace": "app", "name": "prometheus", "kind": "pod"}, "policies": []interface{}{"DisallowPrivileged"}},
			map[string]interface{}{"matcher": map[string]interface{}{"namespace": "app", "name": "(?=bad)bad", "kind": "pod"}, "policies": []interface{}{"DisallowPrivileged"}},
		}},
	}}
	if err := informer.GetStore().Add(object); err != nil {
		t.Fatal(err)
	}
	compiler := NewCompiler(client, informer)
	for range 2 {
		if err := compiler.Publish(context.Background()); err != nil {
			t.Fatal(err)
		}
	}
	spec := published["spec"].(map[string]interface{})
	if spec["valid"] != true || len(spec["nativeMatchers"].([]interface{})) != 1 {
		t.Fatalf("invalid regex revoked unrelated grants: %+v", spec)
	}
	metadata := published["metadata"].(map[string]interface{})
	annotation := metadata["annotations"].(map[string]interface{})["policy.uds.dev/invalid-matchers"]
	if annotation != "[\"uds-policy-exemptions/partial\"]" {
		t.Fatalf("missing offending Exemption: %v", annotation)
	}
	events := 0
	for _, action := range client.Actions() {
		if action.GetVerb() == "create" && action.GetResource().Resource == "events" {
			event := action.(ktesting.CreateAction).GetObject().(*unstructured.Unstructured)
			if event.Object["type"] != "Warning" || event.Object["reason"] != "InvalidRE2Matcher" {
				t.Fatal(event)
			}
			uid, _, _ := unstructured.NestedString(event.Object, "involvedObject", "uid")
			if uid != "partial-uid" {
				t.Fatal("event attached to wrong owner")
			}
			events++
		}
	}
	if events != 2 {
		t.Fatalf("expected deduplicated event attempts: %d", events)
	}
}
