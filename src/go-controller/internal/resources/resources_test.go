// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
package resources

import (
	"context"
	"errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/dynamic/fake"
	ktesting "k8s.io/client-go/testing"
	"testing"
)

func TestOrphanDeletionErrorsPropagateAndPinUID(t *testing.T) {
	gvr := schema.GroupVersionResource{Group: "security.istio.io", Version: "v1", Resource: "authorizationpolicies"}
	object := &unstructured.Unstructured{Object: map[string]interface{}{"apiVersion": "security.istio.io/v1", "kind": "AuthorizationPolicy", "metadata": map[string]interface{}{"name": "stale", "namespace": "apps", "uid": "old-uid", "labels": map[string]interface{}{"uds/package": "app", "uds/generation": "1"}}}}
	object.SetResourceVersion("7")
	object.SetOwnerReferences([]metav1.OwnerReference{{APIVersion: "uds.dev/v1alpha1", Kind: "Package", UID: "package-uid", Name: "app"}})
	client := fake.NewSimpleDynamicClientWithCustomListKinds(runtime.NewScheme(), map[schema.GroupVersionResource]string{gvr: "AuthorizationPolicyList"}, object)
	expected := errors.New("delete forbidden")
	client.PrependReactor("delete", "authorizationpolicies", func(action ktesting.Action) (bool, runtime.Object, error) {
		opts := action.(ktesting.DeleteAction).GetDeleteOptions()
		if opts.Preconditions == nil || opts.Preconditions.UID == nil || *opts.Preconditions.UID != "old-uid" {
			t.Fatal("delete could target a recreated policy")
		}
		if opts.Preconditions.ResourceVersion == nil || *opts.Preconditions.ResourceVersion != "7" {
			t.Fatal("delete could remove a resource whose ownership changed")
		}
		return true, nil, expected
	})
	if err := PurgeOrphans(context.Background(), client, gvr, "apps", "app", "2", nil, "package-uid"); !errors.Is(err, expected) {
		t.Fatalf("cleanup error hidden: %v", err)
	}
}

func TestOwnedApplyCannotAdoptAnotherPackageUID(t *testing.T) {
	gvr := schema.GroupVersionResource{Group: "security.istio.io", Version: "v1", Resource: "authorizationpolicies"}
	existing := &unstructured.Unstructured{Object: map[string]interface{}{"apiVersion": "security.istio.io/v1", "kind": "AuthorizationPolicy", "metadata": map[string]interface{}{"name": "policy", "namespace": "apps", "ownerReferences": []interface{}{map[string]interface{}{"apiVersion": "uds.dev/v1alpha1", "kind": "Package", "name": "old", "uid": "old-package"}}}}}
	client := fake.NewSimpleDynamicClientWithCustomListKinds(runtime.NewScheme(), map[schema.GroupVersionResource]string{gvr: "AuthorizationPolicyList"}, existing)
	desired := existing.DeepCopy()
	refs := desired.GetOwnerReferences()
	refs[0].UID = "new-package"
	desired.SetOwnerReferences(refs)
	if err := ServerSideApply(context.Background(), client, gvr, desired); err == nil {
		t.Fatal("foreign Package resource was adopted")
	}
	for _, action := range client.Actions() {
		if action.GetVerb() == "patch" {
			t.Fatal("foreign resource mutated before ownership rejection")
		}
	}
}
