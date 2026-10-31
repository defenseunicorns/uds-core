// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package network

import (
	"context"
	"errors"
	"testing"

	networkingv1 "k8s.io/api/networking/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/client-go/kubernetes/fake"
	ktesting "k8s.io/client-go/testing"
)

func TestNetworkOrphanCleanupUsesOwnerUIDAndPhysicalPreconditions(t *testing.T) {
	owned := &networkingv1.NetworkPolicy{ObjectMeta: metav1.ObjectMeta{Name: "owned", Namespace: "apps", UID: "owned-resource", ResourceVersion: "3", Labels: map[string]string{"uds/package": "app", "uds/generation": "old"}, OwnerReferences: []metav1.OwnerReference{{APIVersion: "uds.dev/v1alpha1", Kind: "Package", UID: "current"}}}}
	foreign := owned.DeepCopy()
	foreign.Name, foreign.UID, foreign.OwnerReferences[0].UID = "foreign", "foreign-resource", "other"
	client := fake.NewClientset(owned, foreign)
	client.PrependReactor("delete", "networkpolicies", func(action ktesting.Action) (bool, runtime.Object, error) {
		if action.(ktesting.DeleteAction).GetName() != "owned" {
			t.Fatal("discovery labels authorized foreign deletion")
		}
		options := action.(ktesting.DeleteAction).GetDeleteOptions()
		if options.Preconditions == nil || options.Preconditions.UID == nil || *options.Preconditions.UID != owned.UID || options.Preconditions.ResourceVersion == nil || *options.Preconditions.ResourceVersion != owned.ResourceVersion {
			t.Fatal("physical ownership preconditions missing")
		}
		return false, nil, nil
	})
	if err := purgeOrphans(context.Background(), client.NetworkingV1(), "apps", "app", "new", "current"); err != nil {
		t.Fatal(err)
	}
	if _, err := client.NetworkingV1().NetworkPolicies("apps").Get(context.Background(), owned.Name, metav1.GetOptions{}); !apierrors.IsNotFound(err) {
		t.Fatalf("owned orphan remains: %v", err)
	}
	if _, err := client.NetworkingV1().NetworkPolicies("apps").Get(context.Background(), foreign.Name, metav1.GetOptions{}); err != nil {
		t.Fatalf("foreign policy removed: %v", err)
	}
}

func TestNetworkCleanupErrorsAreRetried(t *testing.T) {
	owned := &networkingv1.NetworkPolicy{ObjectMeta: metav1.ObjectMeta{Name: "owned", Namespace: "apps", UID: "owned-resource", Labels: map[string]string{"uds/package": "app"}, OwnerReferences: []metav1.OwnerReference{{APIVersion: "uds.dev/v1alpha1", Kind: "Package", UID: "current"}}}}
	client := fake.NewClientset(owned)
	expected := errors.New("ownership version changed")
	client.PrependReactor("delete", "networkpolicies", func(ktesting.Action) (bool, runtime.Object, error) { return true, nil, expected })
	if err := purgeOrphans(context.Background(), client.NetworkingV1(), "apps", "app", "new", "current"); !errors.Is(err, expected) {
		t.Fatalf("cleanup failure hidden: %v", err)
	}
}
