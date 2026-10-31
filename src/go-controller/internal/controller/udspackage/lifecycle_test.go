// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
package udspackage

import (
	"context"
	"errors"
	udstypes "github.com/defenseunicorns/uds-core/src/go-controller/api/uds/v1alpha1"
	udsfake "github.com/defenseunicorns/uds-core/src/go-controller/client/clientset/versioned/fake"
	informer "github.com/defenseunicorns/uds-core/src/go-controller/client/informers/externalversions"
	"github.com/defenseunicorns/uds-core/src/go-controller/internal/featureflags"
	"github.com/defenseunicorns/uds-core/src/go-controller/internal/store"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/client-go/kubernetes/fake"
	ktesting "k8s.io/client-go/testing"
	"k8s.io/utils/ptr"
	"testing"
)

func fixtureController(t *testing.T, pkg *udstypes.UDSPackage, flags featureflags.Flags) (*PackageController, *udsfake.Clientset, *fake.Clientset) {
	t.Helper()
	uds := udsfake.NewClientset(pkg)
	kube := fake.NewClientset()
	factory := informer.NewSharedInformerFactory(uds, 0)
	packages := factory.Uds().V1alpha1().UDSPackages()
	if err := packages.Informer().GetIndexer().Add(pkg.DeepCopy()); err != nil {
		t.Fatal(err)
	}
	ctrl := NewController(uds.UdsV1alpha1(), packages, kube, nil, flags, store.NewWaypointStore())
	t.Cleanup(ctrl.queue.ShutDown)
	return ctrl, uds, kube
}
func TestRetryBudgetAndCleanupJournalSurvivePending(t *testing.T) {
	ctx := context.Background()
	pkg := &udstypes.UDSPackage{ObjectMeta: metav1.ObjectMeta{Name: "app", Namespace: "apps", UID: "package", Generation: 2}, Status: udstypes.PackageStatus{SsoClients: []string{"old-client"}, AuthserviceClients: []udstypes.AuthserviceClient{{ClientID: "old-client"}}}}
	ctrl, uds, _ := fixtureController(t, pkg, featureflags.Flags{IstioInjection: true})
	for attempt := 1; attempt <= 5; attempt++ {
		current, _ := uds.UdsV1alpha1().UDSPackages("apps").Get(ctx, "app", metav1.GetOptions{})
		err := ctrl.reconcile(ctx, current)
		if attempt < 5 && err == nil {
			t.Fatal("failed namespace reconciliation did not retry")
		}
		got, _ := uds.UdsV1alpha1().UDSPackages("apps").Get(ctx, "app", metav1.GetOptions{})
		if len(got.Status.SsoClients) != 1 || len(got.Status.AuthserviceClients) != 1 {
			t.Fatal("Pending/failure erased cleanup ownership")
		}
		if attempt < 5 && ptr.Deref(got.Status.RetryAttempt, 0) != int64(attempt) {
			t.Fatalf("retry budget reset: %v", got.Status.RetryAttempt)
		}
		if attempt == 5 && ptr.Deref(got.Status.Phase, "") != udstypes.PhaseFailed {
			t.Fatalf("expected Failed after fifth attempt, got %v", got.Status.Phase)
		}
	}
}
func TestExternalOwnershipJournaledBeforeIdentitySideEffects(t *testing.T) {
	pkg := &udstypes.UDSPackage{ObjectMeta: metav1.ObjectMeta{Name: "app", Namespace: "apps", UID: "package", Generation: 1}, Spec: udstypes.Spec{Sso: []udstypes.Sso{{ClientID: "new-client", EnableAuthserviceSelector: map[string]string{"app": "demo"}}}}, Status: udstypes.PackageStatus{SsoClients: []string{"old-client"}}}
	ctrl, uds, _ := fixtureController(t, pkg, featureflags.Flags{SSO: true})
	if err := ctrl.reconcile(context.Background(), pkg.DeepCopy()); err == nil {
		t.Fatal("missing identity dependency should fail")
	}
	got, _ := uds.UdsV1alpha1().UDSPackages("apps").Get(context.Background(), "app", metav1.GetOptions{})
	if len(got.Status.SsoClients) != 2 || len(got.Status.AuthserviceClients) != 1 || len(got.Finalizers) != 1 {
		t.Fatalf("prospective ownership was not durable: %#v", got.Status)
	}
}
func TestFinalizerRetriesRemovingAndRemovalFailed(t *testing.T) {
	ctx := context.Background()
	now := metav1.Now()
	pkg := &udstypes.UDSPackage{ObjectMeta: metav1.ObjectMeta{Name: "app", Namespace: "apps", UID: "package", DeletionTimestamp: &now, Finalizers: []string{packageFinalizer}}, Status: udstypes.PackageStatus{Phase: ptr.To(udstypes.PhaseRemoving), SsoClients: []string{"owned"}}}
	ctrl, uds, kube := fixtureController(t, pkg, featureflags.Flags{IstioInjection: true})
	_, err := kube.CoreV1().Namespaces().Create(ctx, &corev1.Namespace{ObjectMeta: metav1.ObjectMeta{Name: "apps", Labels: map[string]string{"istio.io/dataplane-mode": "ambient"}, Annotations: map[string]string{"uds.dev/pkg-app": "ambient", "uds.dev/original-istio-state": "none"}}}, metav1.CreateOptions{})
	if err != nil {
		t.Fatal(err)
	}
	fail := true
	kube.PrependReactor("patch", "namespaces", func(ktesting.Action) (bool, runtime.Object, error) {
		if fail {
			return true, nil, errors.New("namespace patch rejected")
		}
		return false, nil, nil
	})
	if err := ctrl.handleFinalizer(ctx, pkg.DeepCopy()); err == nil {
		t.Fatal("cleanup error hidden")
	}
	current, _ := uds.UdsV1alpha1().UDSPackages("apps").Get(ctx, "app", metav1.GetOptions{})
	if len(current.Finalizers) == 0 || len(current.Status.SsoClients) != 1 || ptr.Deref(current.Status.Phase, "") != udstypes.PhaseRemovalFailed {
		t.Fatal("failed finalizer erased ownership or dropped marker")
	}
	fail = false
	if err := ctrl.handleFinalizer(ctx, current); err != nil {
		t.Fatal(err)
	}
	current, _ = uds.UdsV1alpha1().UDSPackages("apps").Get(ctx, "app", metav1.GetOptions{})
	if len(current.Finalizers) != 0 {
		t.Fatal("RemovalFailed never retried")
	}
}
