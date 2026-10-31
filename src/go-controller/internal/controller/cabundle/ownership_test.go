// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package cabundle

import (
	"context"
	"testing"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes/fake"
)

func TestCABundleLabelsCannotAuthorizeForeignCleanup(t *testing.T) {
	for _, owners := range [][]metav1.OwnerReference{nil, {{APIVersion: "uds.dev/v1alpha1", Kind: "Package", UID: "other"}}} {
		cm := &corev1.ConfigMap{ObjectMeta: metav1.ObjectMeta{Name: "custom", Namespace: "apps", UID: "resource", ResourceVersion: "5", Labels: map[string]string{"uds/package": "app", caBundleLabel: "true"}, OwnerReferences: owners}, Data: map[string]string{"ca-bundle.pem": "foreign-trust"}}
		client := fake.NewClientset(cm)
		if err := purgeOrphans(context.Background(), client.CoreV1(), "apps", "app", "", "current"); err != nil {
			t.Fatal(err)
		}
		actual, err := client.CoreV1().ConfigMaps("apps").Get(context.Background(), "custom", metav1.GetOptions{})
		if err != nil || actual.Data["ca-bundle.pem"] != "foreign-trust" || actual.ResourceVersion != "5" {
			t.Fatalf("foreign trust changed: %v", err)
		}
	}
}
