// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
package udspackage

import (
	"context"
	"fmt"
	"testing"

	udstypes "github.com/defenseunicorns/uds-core/src/go-controller/api/uds/v1alpha1"
	udsfake "github.com/defenseunicorns/uds-core/src/go-controller/client/clientset/versioned/fake"
	udsinf "github.com/defenseunicorns/uds-core/src/go-controller/client/informers/externalversions"
	"github.com/defenseunicorns/uds-core/src/go-controller/internal/featureflags"
	"github.com/defenseunicorns/uds-core/src/go-controller/internal/store"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/client-go/kubernetes/fake"
	"k8s.io/client-go/tools/cache"
	"k8s.io/utils/ptr"
)

func readyPackage(name string) *udstypes.UDSPackage {
	return &udstypes.UDSPackage{ObjectMeta: metav1.ObjectMeta{Name: name, Namespace: "apps", UID: types.UID(name), Generation: 1, Finalizers: []string{packageFinalizer}}, Status: udstypes.PackageStatus{Phase: ptr.To(udstypes.PhaseReady), ObservedGeneration: ptr.To(int64(1))}}
}

func resyncFixture(t *testing.T, count int) (*PackageController, *udsfake.Clientset, cache.Indexer) {
	t.Helper()
	var objects []runtime.Object
	for i := range count {
		objects = append(objects, readyPackage(fmt.Sprintf("stable-%02d", i)))
	}
	uds := udsfake.NewClientset(objects...)
	factory := udsinf.NewSharedInformerFactory(uds, 0)
	informer := factory.Uds().V1alpha1().UDSPackages()
	indexer := informer.Informer().GetIndexer()
	ctrl := NewController(uds.UdsV1alpha1(), informer, fake.NewClientset(), nil, featureflags.Flags{}, store.NewWaypointStore())
	t.Cleanup(ctrl.queue.ShutDown)
	for _, object := range objects {
		pkg := object.(*udstypes.UDSPackage)
		if err := indexer.Add(pkg.DeepCopy()); err != nil {
			t.Fatal(err)
		}
		ctrl.recovery.complete(pkg.UID, ctrl.recovery.capture(pkg.UID))
	}
	return ctrl, uds, indexer
}

func drainPackages(ctrl *PackageController) {
	for ctrl.queue.Len() > 0 {
		ctrl.processNext(context.Background())
	}
}

func TestPeriodicResyncKeepsStableCacheAndAllowsQueuedForegroundUpdate(t *testing.T) {
	ctrl, uds, indexer := resyncFixture(t, 33)
	ctrl.Resync()
	// A real generation event arrives after the periodic burst has been queued.
	foreground := readyPackage("foreground")
	foreground.Generation = 2
	if err := uds.Tracker().Add(foreground.DeepCopy()); err != nil {
		t.Fatal(err)
	}
	if err := indexer.Add(foreground.DeepCopy()); err != nil {
		t.Fatal(err)
	}
	ctrl.addPackage(foreground)
	drainPackages(ctrl)
	gets, writes := 0, 0
	for _, action := range uds.Actions() {
		if action.GetVerb() == "get" {
			gets++
		}
		if action.GetVerb() == "update" {
			writes++
			if action.GetSubresource() != "status" {
				t.Fatal("periodic check rewrote an unchanged finalizer")
			}
		}
	}
	if gets != 34 || writes != 2 {
		t.Fatalf("stable checks performed workflow side effects: %d gets, %d writes", gets, writes)
	}
	got, err := uds.UdsV1alpha1().UDSPackages("apps").Get(context.Background(), foreground.Name, metav1.GetOptions{})
	if err != nil || ptr.Deref(got.Status.ObservedGeneration, 0) != 2 || ptr.Deref(got.Status.Phase, "") != udstypes.PhaseReady {
		t.Fatalf("foreground update did not converge after stable checks: %#v, %v", got, err)
	}
}

func TestPeriodicResyncDoesNotClearDriftOrGenerationRecovery(t *testing.T) {
	for _, event := range []string{"owned-drift", "dependency", "generation"} {
		t.Run(event, func(t *testing.T) {
			ctrl, uds, indexer := resyncFixture(t, 1)
			pkg := readyPackage("stable-00")
			switch event {
			case "owned-drift":
				ctrl.RequeueName(pkg.Namespace, pkg.Name)
			case "dependency":
				ctrl.RequeueAll()
			case "generation":
				changed := pkg.DeepCopy()
				changed.Generation = 2
				if err := uds.Tracker().Update(udstypes.SchemeGroupVersion.WithResource("packages"), changed, changed.Namespace); err != nil {
					t.Fatal(err)
				}
				if err := indexer.Update(changed); err != nil {
					t.Fatal(err)
				}
				ctrl.updatePackage(pkg, changed)
			}
			ctrl.Resync()
			if !ctrl.recovery.dirty(pkg.UID) {
				t.Fatal("periodic enqueue cleared a real recovery event")
			}
			drainPackages(ctrl)
			writes := 0
			for _, action := range uds.Actions() {
				if action.GetVerb() == "update" && action.GetSubresource() == "status" {
					writes++
				}
			}
			if writes != 2 || ctrl.recovery.dirty(pkg.UID) {
				t.Fatalf("real event was skipped or not acknowledged: %d writes", writes)
			}
		})
	}
}

func TestPeriodicResyncRetainsExternalFailureRetryAndDeletion(t *testing.T) {
	ctrl, uds, indexer := resyncFixture(t, 2)
	failed := readyPackage("stable-00")
	failed.Status.Phase = ptr.To(udstypes.PhaseFailed)
	deleting := readyPackage("stable-01")
	now := metav1.Now()
	deleting.DeletionTimestamp = &now
	for _, pkg := range []*udstypes.UDSPackage{failed, deleting} {
		if err := uds.Tracker().Update(udstypes.SchemeGroupVersion.WithResource("packages"), pkg, pkg.Namespace); err != nil {
			t.Fatal(err)
		}
		if err := indexer.Update(pkg); err != nil {
			t.Fatal(err)
		}
	}
	ctrl.Resync()
	drainPackages(ctrl)
	got, _ := uds.UdsV1alpha1().UDSPackages("apps").Get(context.Background(), failed.Name, metav1.GetOptions{})
	if ptr.Deref(got.Status.Phase, "") != udstypes.PhaseReady {
		t.Fatal("external failure without a watch event never retried")
	}
	got, _ = uds.UdsV1alpha1().UDSPackages("apps").Get(context.Background(), deleting.Name, metav1.GetOptions{})
	if len(got.Finalizers) != 0 {
		t.Fatal("clean recovery cache skipped live API finalization")
	}
}
