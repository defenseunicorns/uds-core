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
	if published.Valid || len(published.NativeMatchers) != 0 || len(published.LegacyScopes) != 0 {
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
