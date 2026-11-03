// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package webhook

import (
	"bytes"
	"context"
	"crypto/x509"
	"fmt"
	corev1 "k8s.io/api/core/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	ktesting "k8s.io/client-go/testing"
	"testing"
	"time"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes/fake"
)

func verifyReplicaCertificatesAt(t *testing.T, client *fake.Clientset, now time.Time, managers ...*ServingManager) {
	t.Helper()
	registration, err := client.AdmissionregistrationV1().ValidatingWebhookConfigurations().Get(context.Background(), "uds-controller-pods", metav1.GetOptions{})
	if err != nil {
		t.Fatal(err)
	}
	roots := x509.NewCertPool()
	if !roots.AppendCertsFromPEM(registration.Webhooks[0].ClientConfig.CABundle) {
		t.Fatal("invalid published trust bundle")
	}
	for _, manager := range managers {
		pair, err := manager.GetCertificate(nil)
		if err != nil || !manager.ready.Load() {
			t.Fatalf("replica became unavailable during proactive renewal: %v", err)
		}
		if _, err := pair.Leaf.Verify(x509.VerifyOptions{Roots: roots, DNSName: "uds-controller.uds-system.svc", CurrentTime: now}); err != nil {
			t.Fatalf("published trust does not verify a serving replica: %v", err)
		}
	}
}

func TestProactiveRenewalPreservesReplicaTrust(t *testing.T) {
	ctx := context.Background()
	client, originalCA := servingFixture(t)
	first, err := newServingManager(ctx, client)
	if err != nil {
		t.Fatal(err)
	}
	second, err := newServingManager(ctx, client)
	if err != nil {
		t.Fatal(err)
	}
	leaf := first.certificate.Load().Leaf
	renewAt := leaf.NotBefore.Add(leaf.NotAfter.Sub(leaf.NotBefore) * 2 / 3)
	now := renewAt.Add(-time.Second)
	first.now = func() time.Time { return now }
	second.now = first.now
	for _, manager := range []*ServingManager{first, second} {
		if err := manager.Synchronize(ctx); err != nil {
			t.Fatal(err)
		}
	}
	before, _ := client.CoreV1().Secrets(servingNamespace).Get(ctx, servingSecretName, metav1.GetOptions{})
	if !bytes.Equal(before.Data["ca.crt"], originalCA) {
		t.Fatal("renewed before two-thirds lifetime")
	}
	now = renewAt.Add(time.Second)
	if err := first.Synchronize(ctx); err != nil {
		t.Fatal(err)
	}
	after, _ := client.CoreV1().Secrets(servingNamespace).Get(ctx, servingSecretName, metav1.GetOptions{})
	if bytes.Equal(after.Data["ca.crt"], originalCA) {
		t.Fatal("certificate was not renewed")
	}
	verifyReplicaCertificatesAt(t, client, now, first, second)
	if err := second.Synchronize(ctx); err != nil {
		t.Fatal(err)
	}
	verifyReplicaCertificatesAt(t, client, now, first, second)
	now = now.Add(trustPropagation + time.Second)
	if err := first.Synchronize(ctx); err != nil {
		t.Fatal(err)
	}
	verifyReplicaCertificatesAt(t, client, now, first, second)
	if err := second.Synchronize(ctx); err != nil {
		t.Fatal(err)
	}
	verifyReplicaCertificatesAt(t, client, now, first, second)
	if !first.certificate.Load().Leaf.IsCA {
		t.Fatal("renewed trust root lacks CA constraints")
	}
	now = now.Add(trustOverlap)
	if err := first.Synchronize(ctx); err != nil {
		t.Fatal(err)
	}
	registration, _ := client.AdmissionregistrationV1().ValidatingWebhookConfigurations().Get(ctx, "uds-controller-pods", metav1.GetOptions{})
	if bytes.Contains(registration.Webhooks[0].ClientConfig.CABundle, originalCA) {
		t.Fatal("expired overlap retained the old root")
	}
	verifyReplicaCertificatesAt(t, client, now, first, second)
}

func TestRenewalAdoptsConcurrentWinnerAndRetriesTrustConflict(t *testing.T) {
	ctx := context.Background()
	client, _ := servingFixture(t)
	manager, err := newServingManager(ctx, client)
	if err != nil {
		t.Fatal(err)
	}
	if err := manager.Synchronize(ctx); err != nil {
		t.Fatal(err)
	}
	leaf := manager.certificate.Load().Leaf
	now := leaf.NotBefore.Add(leaf.NotAfter.Sub(leaf.NotBefore) * 2 / 3).Add(time.Second)
	manager.now = func() time.Time { return now }
	winner, ca, err := generateSelfSignedCertAt(now)
	if err != nil {
		t.Fatal(err)
	}
	key, err := privateKeyPEM(winner)
	if err != nil {
		t.Fatal(err)
	}
	updates, conflicts := 0, 0
	client.PrependReactor("update", "secrets", func(action ktesting.Action) (bool, runtime.Object, error) {
		updates++
		secret := action.(ktesting.UpdateAction).GetObject().(*corev1.Secret).DeepCopy()
		secret.Data = map[string][]byte{"tls.crt": ca, "tls.key": key, "ca.crt": ca}
		if err := client.Tracker().Update(corev1.SchemeGroupVersion.WithResource("secrets"), secret, servingNamespace); err != nil {
			t.Fatal(err)
		}
		return true, nil, apierrors.NewConflict(schema.GroupResource{Resource: "secrets"}, servingSecretName, fmt.Errorf("another replica renewed"))
	})
	client.PrependReactor("patch", "secrets", func(ktesting.Action) (bool, runtime.Object, error) {
		if !manager.ready.Load() {
			t.Error("transient rotation conflict removed a healthy endpoint")
		}
		if conflicts == 0 {
			conflicts++
			return true, nil, apierrors.NewConflict(schema.GroupResource{Resource: "secrets"}, servingSecretName, fmt.Errorf("another replica published overlap"))
		}
		return false, nil, nil
	})
	if err := manager.Synchronize(ctx); err != nil {
		t.Fatal(err)
	}
	if updates != 1 || conflicts != 1 {
		t.Fatalf("unexpected renewal/retry counts %d/%d", updates, conflicts)
	}
	verifyReplicaCertificatesAt(t, client, now, manager)
	now = now.Add(trustPropagation + time.Second)
	if err := manager.Synchronize(ctx); err != nil {
		t.Fatal(err)
	}
	secret, _ := client.CoreV1().Secrets(servingNamespace).Get(ctx, servingSecretName, metav1.GetOptions{})
	if !bytes.Equal(secret.Data["ca.crt"], ca) {
		t.Fatal("losing replica replaced the winning renewal")
	}
	verifyReplicaCertificatesAt(t, client, now, manager)
}

func TestExpiredServingCertificateRecoversAtStartup(t *testing.T) {
	ctx := context.Background()
	client, _ := servingFixture(t)
	expired, ca, err := generateSelfSignedCertAt(time.Now().Add(-366 * 24 * time.Hour))
	if err != nil {
		t.Fatal(err)
	}
	key, err := privateKeyPEM(expired)
	if err != nil {
		t.Fatal(err)
	}
	secret, _ := client.CoreV1().Secrets(servingNamespace).Get(ctx, servingSecretName, metav1.GetOptions{})
	secret.Data = map[string][]byte{"tls.crt": ca, "tls.key": key, "ca.crt": ca}
	if _, err := client.CoreV1().Secrets(servingNamespace).Update(ctx, secret, metav1.UpdateOptions{}); err != nil {
		t.Fatal(err)
	}
	manager, err := newServingManager(ctx, client)
	if err != nil {
		t.Fatal("expired identity prevented recovery", err)
	}
	if err := manager.Synchronize(ctx); err != nil {
		t.Fatal(err)
	}
	if manager.ready.Load() {
		t.Fatal("new identity became Ready before trust propagation")
	}
	now := time.Now().Add(trustPropagation + time.Second)
	manager.now = func() time.Time { return now }
	if err := manager.Synchronize(ctx); err != nil {
		t.Fatal(err)
	}
	verifyReplicaCertificatesAt(t, client, now, manager)
	if manager.certificate.Load().Leaf.NotAfter.Before(now.Add(364 * 24 * time.Hour)) {
		t.Fatal("expired identity was not renewed")
	}
}
