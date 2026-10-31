// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
package dependencies

import (
	"context"
	"reflect"
	"sync"
	"testing"
	"time"

	corev1 "k8s.io/api/core/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/apimachinery/pkg/util/wait"
	"k8s.io/apimachinery/pkg/watch"
	"k8s.io/client-go/tools/cache"
)

type packageEvents struct {
	mu   sync.Mutex
	keys []string
}

func (p *packageEvents) record(key string) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.keys = append(p.keys, key)
}
func (p *packageEvents) RequeueAll()                        { p.record("all") }
func (p *packageEvents) Resync()                            { p.record("periodic") }
func (p *packageEvents) RequeueNamespace(namespace string)  { p.record(namespace + "/*") }
func (p *packageEvents) RequeueName(namespace, name string) { p.record(namespace + "/" + name) }
func (p *packageEvents) RequeueSSOClients(ids []string) {
	for _, id := range ids {
		p.record("client:" + id)
	}
}
func (p *packageEvents) RequeueUIDs(uids []types.UID) {
	for _, uid := range uids {
		p.record("uid:" + string(uid))
	}
}
func (p *packageEvents) snapshot() []string {
	p.mu.Lock()
	defer p.mu.Unlock()
	return append([]string{}, p.keys...)
}
func (p *packageEvents) clear() { p.mu.Lock(); defer p.mu.Unlock(); p.keys = nil }

func ownedGateway() *unstructured.Unstructured {
	return &unstructured.Unstructured{Object: map[string]interface{}{
		"apiVersion": "networking.istio.io/v1beta1", "kind": "Gateway",
		"metadata": map[string]interface{}{"name": "egress", "namespace": "istio-egress-gateway", "uid": "gateway-uid", "resourceVersion": "1", "labels": map[string]interface{}{"uds/package": "shared-sidecar-egress-resource"}},
		"spec":     map[string]interface{}{"servers": []interface{}{map[string]interface{}{"port": int64(443)}}},
	}}
}

func TestOwnedResourceMetadataDriftRetainsPreviousTarget(t *testing.T) {
	for _, change := range []string{"label-removed", "label-reassigned", "owner", "finalizer", "spec", "replaced-uid"} {
		t.Run(change, func(t *testing.T) {
			events := &packageEvents{}
			ctrl := &Controller{packages: events}
			old := ownedGateway()
			old.SetLabels(map[string]string{"uds/package": "previous"})
			current := old.DeepCopy()
			current.SetResourceVersion("2")
			switch change {
			case "label-removed":
				current.SetLabels(nil)
			case "label-reassigned":
				current.SetLabels(map[string]string{"uds/package": "next"})
			case "owner":
				current.SetOwnerReferences([]metav1.OwnerReference{{APIVersion: "uds.dev/v1alpha1", Kind: "Package", Name: "next", UID: "another-uid"}})
			case "finalizer":
				current.SetFinalizers([]string{"foreign-controller"})
			case "spec":
				current.Object["spec"] = map[string]interface{}{"servers": []interface{}{}}
			case "replaced-uid":
				current.SetUID("replacement-uid")
			}
			ctrl.OwnedHandlers().OnUpdate(old, current)
			got := events.snapshot()
			if len(got) == 0 || got[0] != "istio-egress-gateway/previous" {
				t.Fatalf("previous Package lost drift repair: %v", got)
			}
			if change == "label-reassigned" && got[len(got)-1] != "istio-egress-gateway/next" {
				t.Fatalf("new Package target lost: %v", got)
			}
		})
	}
	events := &packageEvents{}
	ctrl := &Controller{packages: events}
	old := ownedGateway()
	current := old.DeepCopy()
	current.SetResourceVersion("2")
	current.Object["status"] = map[string]interface{}{"ready": true}
	ctrl.OwnedHandlers().OnUpdate(old, current)
	if len(events.snapshot()) != 0 {
		t.Fatal("status-only update invalidated stable Package cache")
	}
}

func TestDisconnectedGatewayWatchRelistRepairsSpecAndDeletionDrift(t *testing.T) {
	for _, scenario := range []struct{ deleted, watchList bool }{{false, false}, {true, false}, {false, true}, {true, true}} {
		deleted, supportsWatchList := scenario.deleted, scenario.watchList
		name := map[bool]string{false: "spec", true: "deletion"}[deleted] + map[bool]string{false: "-list", true: "-watch-list"}[supportsWatchList]
		t.Run(name, func(t *testing.T) {
			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cancel()
			events := &packageEvents{}
			ctrl := &Controller{packages: events}
			old := ownedGateway()
			current := old.DeepCopy()
			current.SetResourceVersion("2")
			current.Object["spec"] = map[string]interface{}{"servers": []interface{}{}}
			var mu sync.Mutex
			gap := false
			first, next := watch.NewRaceFreeFake(), watch.NewRaceFreeFake()
			informer := cache.NewSharedIndexInformer(&cache.ListWatch{
				ListFunc: func(metav1.ListOptions) (runtime.Object, error) {
					mu.Lock()
					defer mu.Unlock()
					list := &unstructured.UnstructuredList{Object: map[string]interface{}{"apiVersion": "networking.istio.io/v1beta1", "kind": "GatewayList"}}
					list.SetResourceVersion("2")
					if !gap {
						list.Items = []unstructured.Unstructured{*old.DeepCopy()}
					} else if !deleted {
						list.Items = []unstructured.Unstructured{*current.DeepCopy()}
					}
					return list, nil
				},
				WatchFunc: func(options metav1.ListOptions) (watch.Interface, error) {
					mu.Lock()
					defer mu.Unlock()
					initial := options.SendInitialEvents != nil && *options.SendInitialEvents
					if initial && !supportsWatchList {
						return nil, apierrors.NewBadRequest("sendInitialEvents is unsupported")
					}
					stream := first
					if gap {
						stream = next
					}
					if initial {
						if !gap {
							stream.Add(old.DeepCopy())
						} else if !deleted {
							stream.Add(current.DeepCopy())
						}
						bookmark := &unstructured.Unstructured{}
						bookmark.SetResourceVersion("2")
						bookmark.SetAnnotations(map[string]string{"k8s.io/initial-events-end": "true"})
						stream.Action(watch.Bookmark, bookmark)
					}
					return stream, nil
				},
			}, &unstructured.Unstructured{}, 0, cache.Indexers{})
			informer.AddEventHandler(ctrl.OwnedHandlers())
			done := make(chan struct{})
			go func() { defer close(done); informer.Run(ctx.Done()) }()
			t.Cleanup(func() { cancel(); <-done })
			if !cache.WaitForCacheSync(ctx.Done(), informer.HasSynced) {
				t.Fatal("Gateway cache failed initial sync")
			}
			waitEvents(t, ctx, events)
			events.clear()
			mu.Lock()
			gap = true
			mu.Unlock()
			// A resourceVersion expiration forces the real client-go reflector to
			// relist after the disconnected watch missed the external change.
			first.Error(&metav1.Status{Status: metav1.StatusFailure, Reason: metav1.StatusReasonExpired, Code: 410})
			waitEvents(t, ctx, events)
			if got := events.snapshot(); got[0] != "all" {
				t.Fatalf("shared Gateway drift did not retain full recovery: %v", got)
			}
		})
	}
}

func waitEvents(t *testing.T, ctx context.Context, events *packageEvents) {
	t.Helper()
	if err := wait.PollUntilContextTimeout(ctx, time.Millisecond, 8*time.Second, true, func(context.Context) (bool, error) { return len(events.snapshot()) > 0, nil }); err != nil {
		t.Fatal("actual informer did not deliver recovery event", err)
	}
}

func TestMeshMetadataProjectionIncludesOnlyOperatorFields(t *testing.T) {
	ns := &corev1.Namespace{ObjectMeta: metav1.ObjectMeta{Name: "app", Labels: map[string]string{"istio-injection": "enabled", "foreign": "one"}, Annotations: map[string]string{"uds.dev/pkg-app": "sidecar", "uds.dev/original-istio-state": "none", "foreign": "one"}}}
	current := ns.DeepCopy()
	current.Labels["foreign"] = "two"
	current.Annotations["foreign"] = "two"
	if !reflect.DeepEqual(meshMetadata(ns), meshMetadata(current)) {
		t.Fatal("unrelated metadata invalidated mesh ownership")
	}
	for _, key := range []string{"uds.dev/pkg-app", "uds.dev/original-istio-state", "uds.dev/istio-restart-pending"} {
		current := ns.DeepCopy()
		current.Annotations[key] = "tampered"
		if reflect.DeepEqual(meshMetadata(ns), meshMetadata(current)) {
			t.Fatalf("owned annotation %s drift ignored", key)
		}
	}
	for _, key := range []string{"istio-injection", "istio.io/dataplane-mode"} {
		current := ns.DeepCopy()
		current.Labels[key] = "tampered"
		if reflect.DeepEqual(meshMetadata(ns), meshMetadata(current)) {
			t.Fatalf("owned label %s drift ignored", key)
		}
	}
}
