// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
package udspackage

import (
	"context"
	"errors"
	"reflect"
	"testing"
	"time"

	udstypes "github.com/defenseunicorns/uds-core/src/go-controller/api/uds/v1alpha1"
	"github.com/defenseunicorns/uds-core/src/go-controller/internal/featureflags"
	"github.com/defenseunicorns/uds-core/src/go-controller/internal/store"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	ktesting "k8s.io/client-go/testing"
)

func seededTopology(t *testing.T, ctrl *PackageController, pkg *udstypes.UDSPackage) []store.WaypointEntry {
	t.Helper()
	ctrl.waypointStore.SetForPackage(pkg.Namespace, string(pkg.UID), []store.WaypointEntry{{Selector: map[string]string{"app": "old"}, WaypointName: "old-waypoint"}})
	ctrl.waypointStore.SetForPackage(pkg.Namespace, "another-package", []store.WaypointEntry{{Selector: map[string]string{"app": "other"}, WaypointName: "other-waypoint"}})
	return ctrl.waypointStore.Get(pkg.Namespace)
}

func TestFailedSSOReconcilePreservesConvergedAdmissionTopology(t *testing.T) {
	for _, dependency := range []string{"identity-absent", "operator-secret-forbidden"} {
		t.Run(dependency, func(t *testing.T) {
			pkg := &udstypes.UDSPackage{ObjectMeta: metav1.ObjectMeta{Name: "app", Namespace: "apps", UID: "pkg", Generation: 2}, Spec: udstypes.Spec{Sso: []udstypes.Sso{{ClientID: "app", EnableAuthserviceSelector: map[string]string{"app": "replacement"}}}}}
			ctrl, uds, kube := fixtureController(t, pkg, featureflags.Flags{SSO: true})
			prior := seededTopology(t, ctrl, pkg)
			denied := errors.New("operator credentials read forbidden")
			if dependency == "operator-secret-forbidden" {
				if err := uds.Tracker().Add(&udstypes.UDSPackage{ObjectMeta: metav1.ObjectMeta{Name: "keycloak", Namespace: "keycloak"}}); err != nil {
					t.Fatal(err)
				}
				kube.PrependReactor("get", "secrets", func(ktesting.Action) (bool, runtime.Object, error) { return true, nil, denied })
			}
			err := ctrl.reconcilePackageFlow(context.Background(), pkg.DeepCopy())
			if err == nil || (dependency == "operator-secret-forbidden" && !errors.Is(err, denied)) {
				t.Fatalf("SSO dependency error lost: %v", err)
			}
			if got := ctrl.waypointStore.Get(pkg.Namespace); !reflect.DeepEqual(got, prior) {
				t.Fatalf("failed SSO replaced converged routing: %#v", got)
			}
		})
	}
}

func TestTopologyRemovalPublishesOnlyAfterReadyAndPreservesOtherPackages(t *testing.T) {
	pkg := &udstypes.UDSPackage{ObjectMeta: metav1.ObjectMeta{Name: "app", Namespace: "apps", UID: "pkg", Generation: 2}}
	ctrl, uds, _ := fixtureController(t, pkg, featureflags.Flags{})
	prior := seededTopology(t, ctrl, pkg)
	entered, release := make(chan struct{}), make(chan struct{})
	uds.PrependReactor("update", "packages", func(action ktesting.Action) (bool, runtime.Object, error) {
		if action.GetSubresource() == "status" {
			close(entered)
			<-release
		}
		return false, nil, nil
	})
	done := make(chan error, 1)
	go func() { done <- ctrl.reconcilePackageFlow(context.Background(), pkg.DeepCopy()) }()
	select {
	case <-entered:
	case <-time.After(time.Second):
		close(release)
		t.Fatal("flow did not reach Ready publication")
	}
	if got := ctrl.waypointStore.Get(pkg.Namespace); !reflect.DeepEqual(got, prior) {
		close(release)
		t.Fatal("uncommitted Ready status exposed a routing gap")
	}
	close(release)
	if err := <-done; err != nil {
		t.Fatal(err)
	}
	got := ctrl.waypointStore.Get(pkg.Namespace)
	if len(got) != 1 || got[0].WaypointName != "other-waypoint" {
		t.Fatalf("successful removal damaged another Package's routing: %#v", got)
	}
}

func TestFailedReadyStatusDoesNotPublishTopologyRemoval(t *testing.T) {
	pkg := &udstypes.UDSPackage{ObjectMeta: metav1.ObjectMeta{Name: "app", Namespace: "apps", UID: "pkg", Generation: 2}}
	ctrl, uds, _ := fixtureController(t, pkg, featureflags.Flags{})
	prior := seededTopology(t, ctrl, pkg)
	denied := errors.New("status publication failed")
	uds.PrependReactor("update", "packages", func(ktesting.Action) (bool, runtime.Object, error) { return true, nil, denied })
	if err := ctrl.reconcilePackageFlow(context.Background(), pkg.DeepCopy()); !errors.Is(err, denied) {
		t.Fatalf("status error lost: %v", err)
	}
	if got := ctrl.waypointStore.Get(pkg.Namespace); !reflect.DeepEqual(got, prior) {
		t.Fatal("failed status replaced converged routing")
	}
}
