// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
package udspackage

import (
	"reflect"
	"testing"

	udstypes "github.com/defenseunicorns/uds-core/src/go-controller/api/uds/v1alpha1"
	"github.com/defenseunicorns/uds-core/src/go-controller/internal/featureflags"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/utils/ptr"
)

func convergedTopologyPackage() *udstypes.UDSPackage {
	return &udstypes.UDSPackage{
		ObjectMeta: metav1.ObjectMeta{Name: "app", Namespace: "apps", UID: "pkg", Generation: 1},
		Spec:       udstypes.Spec{Sso: []udstypes.Sso{{ClientID: "old", EnableAuthserviceSelector: map[string]string{"app": "old"}}}},
		Status:     udstypes.PackageStatus{Phase: ptr.To(udstypes.PhaseReady), ObservedGeneration: ptr.To(int64(1))},
	}
}

func TestServingReplicaPublishesReadyStatusWithoutAReconciliationLoop(t *testing.T) {
	pkg := convergedTopologyPackage()
	ctrl, _, _ := fixtureController(t, pkg, featureflags.Flags{SSO: true, IstioInjection: true})
	ctrl.addPackage(pkg)
	prior := ctrl.waypointStore.Get(pkg.Namespace)
	if len(prior) != 1 {
		t.Fatal("serving replica failed to hydrate existing Ready topology")
	}
	pending := pkg.DeepCopy()
	pending.Generation = 2
	pending.Spec.Sso = []udstypes.Sso{{ClientID: "new", EnableAuthserviceSelector: map[string]string{"app": "new"}}}
	ctrl.updatePackage(pkg, pending)
	if got := ctrl.waypointStore.Get(pkg.Namespace); !reflect.DeepEqual(got, prior) {
		t.Fatal("desired generation replaced topology before reconciliation")
	}
	retrying := pending.DeepCopy()
	retrying.Status.Phase = ptr.To(udstypes.PhaseRetrying)
	ctrl.updatePackage(pending, retrying)
	if got := ctrl.waypointStore.Get(pkg.Namespace); !reflect.DeepEqual(got, prior) {
		t.Fatal("transient failure erased last converged topology")
	}
	key, _ := ctrl.queue.Get()
	ctrl.queue.Done(key)
	ready := retrying.DeepCopy()
	ready.Status.Phase = ptr.To(udstypes.PhaseReady)
	ready.Status.ObservedGeneration = &ready.Generation
	ctrl.updatePackage(retrying, ready)
	got := ctrl.waypointStore.Get(pkg.Namespace)
	if len(got) != 1 || got[0].Selector["app"] != "new" || got[0].WaypointName == prior[0].WaypointName {
		t.Fatalf("Ready status-only publication did not reach serving replica: %#v", got)
	}
	if ctrl.queue.Len() != 0 {
		t.Fatal("Ready cache hydration created a status-driven reconciliation loop")
	}
}

func TestFreshReplicaCannotPublishUnconvergedOwnershipJournal(t *testing.T) {
	pkg := convergedTopologyPackage()
	pkg.Generation = 2
	pkg.Spec.Sso = []udstypes.Sso{{ClientID: "new", EnableAuthserviceSelector: map[string]string{"app": "new"}}}
	pkg.Status.Phase = ptr.To(udstypes.PhaseRetrying)
	pkg.Status.AuthserviceClients = []udstypes.AuthserviceClient{{ClientID: "new", Selector: map[string]string{"app": "new"}}}
	ctrl, _, _ := fixtureController(t, pkg, featureflags.Flags{SSO: true, IstioInjection: true})
	ctrl.addPackage(pkg)
	if len(ctrl.waypointStore.Get(pkg.Namespace)) != 0 {
		t.Fatal("prospective cleanup journal became an active topology grant")
	}
}

func TestTopologyUIDReplacementAndDeletionCannotRetainOldOwner(t *testing.T) {
	pkg := convergedTopologyPackage()
	ctrl, _, _ := fixtureController(t, pkg, featureflags.Flags{SSO: true, IstioInjection: true})
	ctrl.addPackage(pkg)
	current := pkg.DeepCopy()
	current.UID = "replacement"
	current.Spec.Sso = []udstypes.Sso{{ClientID: "new", EnableAuthserviceSelector: map[string]string{"app": "new"}}}
	ctrl.updatePackage(pkg, current)
	got := ctrl.waypointStore.Get(pkg.Namespace)
	if len(got) != 1 || got[0].Selector["app"] != "new" {
		t.Fatal("replacement UID retained old topology authority")
	}
	ctrl.deletePackage(pkg)
	if len(ctrl.waypointStore.Get(pkg.Namespace)) != 1 {
		t.Fatal("delayed old UID deletion removed replacement topology")
	}
	removed := current.DeepCopy()
	now := metav1.Now()
	removed.DeletionTimestamp = &now
	ctrl.updatePackage(current, removed)
	if len(ctrl.waypointStore.Get(pkg.Namespace)) != 0 {
		t.Fatal("deletion did not revoke the current Package topology")
	}
}
