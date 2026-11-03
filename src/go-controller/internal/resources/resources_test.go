// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
package resources

import (
	"context"
	"encoding/json"
	"errors"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
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

func TestOwnedApplyRetriesStatusConflictAndRechecksOwner(t *testing.T) {
	gvr := schema.GroupVersionResource{Group: "example.dev", Version: "v1", Resource: "widgets"}
	for _, reassigned := range []bool{false, true} {
		existing := &unstructured.Unstructured{Object: map[string]interface{}{"apiVersion": "example.dev/v1", "kind": "Widget", "metadata": map[string]interface{}{"name": "widget", "namespace": "apps"}}}
		existing.SetResourceVersion("1")
		existing.SetOwnerReferences([]metav1.OwnerReference{{APIVersion: "uds.dev/v1alpha1", Kind: "Package", Name: "app", UID: "owner"}})
		desired := existing.DeepCopy()
		desired.SetResourceVersion("")
		client := fake.NewSimpleDynamicClient(runtime.NewScheme(), existing)
		patches := 0
		client.PrependReactor("patch", "widgets", func(a ktesting.Action) (bool, runtime.Object, error) {
			patches++
			var body unstructured.Unstructured
			if err := json.Unmarshal(a.(ktesting.PatchAction).GetPatch(), &body); err != nil {
				t.Fatal(err)
			}
			if patches == 1 {
				updated := existing.DeepCopy()
				updated.SetResourceVersion("2")
				if reassigned {
					refs := updated.GetOwnerReferences()
					refs[0].UID = "other"
					updated.SetOwnerReferences(refs)
				}
				client.Tracker().Update(gvr, updated, "apps")
				return true, nil, apierrors.NewConflict(gvr.GroupResource(), "widget", errors.New("concurrent status update"))
			}
			if body.GetResourceVersion() != "2" {
				t.Fatal("did not reobserve latest resourceVersion")
			}
			return true, &body, nil
		})
		err := ServerSideApply(context.Background(), client, gvr, desired)
		if reassigned {
			if err == nil || patches != 1 {
				t.Fatal("overwrote new owner", patches, err)
			}
		} else if err != nil || patches != 2 {
			t.Fatal("status race did not recover", patches, err)
		}
		if desired.GetResourceVersion() != "" {
			t.Fatal("apply mutated caller object")
		}
	}
}
