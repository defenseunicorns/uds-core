// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package sso

import (
	"context"
	"testing"

	udstypes "github.com/defenseunicorns/uds-core/src/go-controller/api/uds/v1alpha1"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/client-go/kubernetes/fake"
	ktesting "k8s.io/client-go/testing"
)

func TestSSOSecretCollisionDoesNotOverwriteOrPurgeAnotherOwner(t *testing.T) {
	existing := &corev1.Secret{ObjectMeta: metav1.ObjectMeta{Name: "sso-client-foo-bar", Namespace: "apps", UID: "original-secret", ResourceVersion: "5", Labels: map[string]string{"uds/package": "new", "uds/generation": "old"}, OwnerReferences: []metav1.OwnerReference{{APIVersion: "uds.dev/v1alpha1", Kind: "Package", UID: "original"}}}, Data: map[string][]byte{"client-secret": []byte("original-test-value")}}
	client := fake.NewClientset(existing)
	owners := []metav1.OwnerReference{{APIVersion: "uds.dev/v1alpha1", Kind: "Package", UID: "new"}}
	if err := createClientSecret(context.Background(), client.CoreV1(), udstypes.Sso{}, Client{ClientID: "foo.bar", Secret: "new-test-value"}, "apps", "new", "2", owners); err == nil {
		t.Fatal("colliding Secret ownership was replaced")
	}
	if err := purgeOrphanSecrets(context.Background(), client.CoreV1(), "apps", "new", "2", "new"); err != nil {
		t.Fatal(err)
	}
	actual, err := client.CoreV1().Secrets("apps").Get(context.Background(), existing.Name, metav1.GetOptions{})
	if err != nil || string(actual.Data["client-secret"]) != "original-test-value" || actual.ResourceVersion != "5" {
		t.Fatalf("foreign Secret changed: %v", err)
	}
	for _, action := range client.Actions() {
		if action.GetVerb() == "update" || action.GetVerb() == "delete" {
			t.Fatal("foreign Secret mutation reached API")
		}
	}
}

func TestSSOSecretPurgePinsPhysicalIdentity(t *testing.T) {
	secret := &corev1.Secret{ObjectMeta: metav1.ObjectMeta{Name: "stale", Namespace: "apps", UID: "secret-uid", ResourceVersion: "7", Labels: map[string]string{"uds/package": "app", "uds/generation": "old"}, OwnerReferences: []metav1.OwnerReference{{APIVersion: "uds.dev/v1alpha1", Kind: "Package", UID: "current"}}}}
	client := fake.NewClientset(secret)
	client.PrependReactor("delete", "secrets", func(action ktesting.Action) (bool, runtime.Object, error) {
		options := action.(ktesting.DeleteAction).GetDeleteOptions()
		if options.Preconditions == nil || options.Preconditions.UID == nil || *options.Preconditions.UID != secret.UID || options.Preconditions.ResourceVersion == nil || *options.Preconditions.ResourceVersion != secret.ResourceVersion {
			t.Fatal("Secret deletion could target a replacement")
		}
		return false, nil, nil
	})
	if err := purgeOrphanSecrets(context.Background(), client.CoreV1(), "apps", "app", "new", "current"); err != nil {
		t.Fatal(err)
	}
}
