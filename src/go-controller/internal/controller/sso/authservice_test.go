// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
package sso

import (
	"context"
	"errors"
	udstypes "github.com/defenseunicorns/uds-core/src/go-controller/api/uds/v1alpha1"
	appsv1 "k8s.io/api/apps/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/client-go/kubernetes/fake"
	ktesting "k8s.io/client-go/testing"
	"testing"
)

func TestAuthserviceRolloutRetriesAfterSecretAlreadyConverged(t *testing.T) {
	ctx := context.Background()
	client := fake.NewClientset(&appsv1.Deployment{ObjectMeta: metav1.ObjectMeta{Name: "authservice", Namespace: authserviceNamespace}})
	pkg := &udstypes.UDSPackage{Spec: udstypes.Spec{Sso: []udstypes.Sso{{ClientID: "app", EnableAuthserviceSelector: map[string]string{"app": "demo"}}}}}
	clients := map[string]Client{"app": {ClientID: "app", Secret: "app-secret", RedirectUris: []string{"https://app.uds.dev/callback"}}}
	fail := true
	client.PrependReactor("patch", "deployments", func(ktesting.Action) (bool, runtime.Object, error) {
		if fail {
			return true, nil, errors.New("temporary rollout failure")
		}
		return false, nil, nil
	})
	if _, err := ReconcileAuthservice(ctx, client, pkg, clients); err == nil {
		t.Fatal("rollout error was hidden")
	}
	fail = false
	if _, err := ReconcileAuthservice(ctx, client, pkg, clients); err != nil {
		t.Fatal(err)
	}
	deployment, _ := client.AppsV1().Deployments(authserviceNamespace).Get(ctx, "authservice", metav1.GetOptions{})
	if deployment.Spec.Template.Annotations["pepr.dev/checksum"] == "" {
		t.Fatal("retry skipped rollout because Secret was already updated")
	}
	client.ClearActions()
	if _, err := ReconcileAuthservice(ctx, client, pkg, clients); err != nil {
		t.Fatal(err)
	}
	for _, action := range client.Actions() {
		if action.GetVerb() == "patch" && action.GetResource().Resource == "deployments" {
			t.Fatal("converged authservice rolled unnecessarily")
		}
	}
}
