// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package resources

import (
	"context"
	"testing"

	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/client-go/dynamic/fake"
)

func TestOrphanDiscoveryLabelsDoNotAuthorizeForeignDeletion(t *testing.T) {
	gvr := schema.GroupVersionResource{Group: "security.istio.io", Version: "v1", Resource: "authorizationpolicies"}
	var objects []runtime.Object
	for _, entry := range []struct {
		name   string
		owners []types.UID
	}{
		{"owned", []types.UID{"current"}}, {"foreign", []types.UID{"other"}},
		{"unowned", nil}, {"shared", []types.UID{"current", "other"}},
	} {
		obj := &unstructured.Unstructured{Object: map[string]interface{}{"apiVersion": "security.istio.io/v1", "kind": "AuthorizationPolicy"}}
		obj.SetName(entry.name)
		obj.SetNamespace("apps")
		obj.SetUID(types.UID(entry.name))
		obj.SetResourceVersion("1")
		obj.SetLabels(map[string]string{"uds/package": "app", "uds/generation": "old"})
		for _, uid := range entry.owners {
			obj.SetOwnerReferences(append(obj.GetOwnerReferences(), metav1.OwnerReference{APIVersion: "uds.dev/v1alpha1", Kind: "Package", UID: uid}))
		}
		objects = append(objects, obj)
	}
	client := fake.NewSimpleDynamicClientWithCustomListKinds(runtime.NewScheme(), map[schema.GroupVersionResource]string{gvr: "AuthorizationPolicyList"}, objects...)
	if err := PurgeOrphans(context.Background(), client, gvr, "apps", "app", "new", nil, "current"); err != nil {
		t.Fatal(err)
	}
	if _, err := client.Resource(gvr).Namespace("apps").Get(context.Background(), "owned", metav1.GetOptions{}); !apierrors.IsNotFound(err) {
		t.Fatalf("owned stale resource remains: %v", err)
	}
	for _, name := range []string{"foreign", "unowned", "shared"} {
		if _, err := client.Resource(gvr).Namespace("apps").Get(context.Background(), name, metav1.GetOptions{}); err != nil {
			t.Fatalf("label-authorized deletion removed %s: %v", name, err)
		}
	}
}

func TestOrphanPurgeRequiresPackageUID(t *testing.T) {
	client := fake.NewSimpleDynamicClient(runtime.NewScheme())
	if err := PurgeOrphans(context.Background(), client, schema.GroupVersionResource{}, "apps", "app", "2", nil, ""); err == nil {
		t.Fatal("missing ownership authority was accepted")
	}
	if len(client.Actions()) != 0 {
		t.Fatal("missing authority reached the API")
	}
}
