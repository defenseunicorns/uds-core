// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package webhook

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/defenseunicorns/uds-core/src/go-controller/internal/store"
	admissionv1 "k8s.io/api/admission/v1"
	authenticationv1 "k8s.io/api/authentication/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/client-go/tools/cache"
)

type syncedTopologyInformer struct{ cache.SharedIndexInformer }

func (syncedTopologyInformer) HasSynced() bool { return true }

func topologyInformer(t *testing.T, pkg *unstructured.Unstructured) cache.SharedIndexInformer {
	t.Helper()
	informer := syncedTopologyInformer{cache.NewSharedIndexInformer(&cache.ListWatch{}, &unstructured.Unstructured{}, 0, cache.Indexers{})}
	if pkg != nil {
		if err := informer.GetStore().Add(pkg); err != nil {
			t.Fatal(err)
		}
	}
	return informer
}

func guardPackage(uid, phase string, selector string) *unstructured.Unstructured {
	sso := []interface{}{}
	if selector != "" {
		sso = append(sso, map[string]interface{}{"clientId": "demo", "enableAuthserviceSelector": map[string]interface{}{"app": selector}})
	}
	return &unstructured.Unstructured{Object: map[string]interface{}{"apiVersion": "uds.dev/v1alpha1", "kind": "Package", "metadata": map[string]interface{}{"name": "app", "namespace": "apps", "uid": uid, "generation": int64(2)}, "spec": map[string]interface{}{"network": map[string]interface{}{"serviceMesh": map[string]interface{}{"mode": "ambient"}}, "sso": sso}, "status": map[string]interface{}{"phase": phase, "observedGeneration": int64(2)}}}
}

func guardObject(kind, app string) map[string]interface{} {
	spec := map[string]interface{}{"containers": []interface{}{map[string]interface{}{"name": "app", "image": "image"}}}
	if kind == "Service" {
		spec = map[string]interface{}{"selector": map[string]interface{}{"app": app}, "ports": []interface{}{map[string]interface{}{"port": 80}}}
	}
	return map[string]interface{}{"metadata": map[string]interface{}{"name": "workload", "namespace": "apps", "uid": "workload-uid", "labels": map[string]interface{}{"app": app}}, "spec": spec}
}

func guardAdmission(t *testing.T, handler http.HandlerFunc, kind string, operation admissionv1.Operation, actor string, object, old map[string]interface{}) *admissionv1.AdmissionResponse {
	t.Helper()
	raw, _ := json.Marshal(object)
	previous, _ := json.Marshal(old)
	review := admissionv1.AdmissionReview{TypeMeta: metav1.TypeMeta{APIVersion: "admission.k8s.io/v1", Kind: "AdmissionReview"}, Request: &admissionv1.AdmissionRequest{UID: "guard", Namespace: "apps", Name: "workload", Operation: operation, UserInfo: authenticationv1.UserInfo{Username: actor}, Kind: metav1.GroupVersionKind{Version: "v1", Kind: kind}, Object: runtime.RawExtension{Raw: raw}, OldObject: runtime.RawExtension{Raw: previous}}}
	body, _ := json.Marshal(review)
	response := httptest.NewRecorder()
	handler(response, httptest.NewRequest(http.MethodPost, "/mutate-waypoint", bytes.NewReader(body)))
	if response.Code != http.StatusOK {
		t.Fatal(response.Code, response.Body.String())
	}
	var result admissionv1.AdmissionReview
	if err := json.Unmarshal(response.Body.Bytes(), &result); err != nil || result.Response == nil {
		t.Fatal("invalid topology response", err)
	}
	return result.Response
}

func topologyHandler(kind string, ws *store.WaypointStore, informer cache.SharedIndexInformer) http.HandlerFunc {
	if kind == "Service" {
		return MutateServiceWaypoint(ws, informer)
	}
	return MutatePodWaypoint(ws, informer)
}

func TestSelectedTopologyRequestsFailClosedWithoutOwnerConvergence(t *testing.T) {
	for _, kind := range []string{"Pod", "Service"} {
		for _, phase := range []string{"Pending", "Retrying", "Ready"} {
			t.Run(kind+"/"+phase, func(t *testing.T) {
				pkg := guardPackage("new-owner", phase, "demo")
				informer, ws := topologyInformer(t, pkg), store.NewWaypointStore()
				// An overlapping selector belonging to another UID is not a grant.
				ws.SetForPackage("apps", "old-owner", []store.WaypointEntry{{Selector: map[string]string{"app": "demo"}, WaypointName: "demo-waypoint"}})
				handler := topologyHandler(kind, ws, informer)
				for _, operation := range []admissionv1.Operation{admissionv1.Create, admissionv1.Update} {
					object := guardObject(kind, "demo")
					result := guardAdmission(t, handler, kind, operation, "tenant", object, object)
					if result.Allowed || result.Result.Code != http.StatusConflict || len(result.Patch) > 0 {
						t.Fatal("fresh/recreated owner inherited unresolved topology", result)
					}
					ordinary := guardObject(kind, "other")
					if !guardAdmission(t, handler, kind, operation, "tenant", ordinary, ordinary).Allowed {
						t.Fatal("unselected request was blocked")
					}
				}
				ws.SetForPackage("apps", "new-owner", []store.WaypointEntry{{Selector: map[string]string{"app": "demo"}, WaypointName: "demo-waypoint"}})
				if result := guardAdmission(t, handler, kind, admissionv1.Create, "tenant", guardObject(kind, "demo"), nil); !result.Allowed || len(result.Patch) == 0 {
					t.Fatal("matching converged owner did not release selected traffic")
				}
			})
		}
	}
}

func TestTopologyUpdatesRetainOldRoutesAndFenceJournalOnlyRequirements(t *testing.T) {
	for _, kind := range []string{"Pod", "Service"} {
		t.Run(kind, func(t *testing.T) {
			pkg := guardPackage("owner", "Retrying", "new")
			informer, ws := topologyInformer(t, pkg), store.NewWaypointStore()
			ws.SetForPackage("apps", "owner", []store.WaypointEntry{{Selector: map[string]string{"app": "old"}, WaypointName: "old-waypoint"}})
			handler := topologyHandler(kind, ws, informer)
			if result := guardAdmission(t, handler, kind, admissionv1.Create, "tenant", guardObject(kind, "old"), nil); !result.Allowed || len(result.Patch) == 0 {
				t.Fatal("failed update removed previous converged routing")
			}
			if guardAdmission(t, handler, kind, admissionv1.Create, "tenant", guardObject(kind, "new"), nil).Allowed {
				t.Fatal("failed desired publication exposed new unprotected selection")
			}
			_ = unstructured.SetNestedSlice(pkg.Object, []interface{}{}, "spec", "sso")
			_ = unstructured.SetNestedSlice(pkg.Object, []interface{}{map[string]interface{}{"clientId": "old", "selector": map[string]interface{}{"app": "old"}}}, "status", "authserviceClients")
			if err := informer.GetStore().Update(pkg); err != nil {
				t.Fatal(err)
			}
			ws.DeleteForPackage("apps", "owner")
			if guardAdmission(t, handler, kind, admissionv1.Create, "tenant", guardObject(kind, "old"), nil).Allowed {
				t.Fatal("journal-only restart fabricated a route")
			}
			_ = unstructured.SetNestedField(pkg.Object, "Ready", "status", "phase")
			_ = informer.GetStore().Update(pkg)
			if !guardAdmission(t, handler, kind, admissionv1.Create, "tenant", guardObject(kind, "old"), nil).Allowed {
				t.Fatal("completed removal was blocked by historical ownership journal")
			}
			_ = informer.GetStore().Delete(pkg)
			ws.SetForPackage("apps", "owner", []store.WaypointEntry{{Selector: map[string]string{"app": "old"}, WaypointName: "old-waypoint"}})
			if result := guardAdmission(t, handler, kind, admissionv1.Create, "tenant", guardObject(kind, "old"), nil); !result.Allowed || len(result.Patch) != 0 {
				t.Fatal("deleted Package cache entry retained topology authority")
			}
		})
	}
}

func TestTopologyReadyRequiresExactConvergedRouteAndPreservesWaypointRepair(t *testing.T) {
	for _, kind := range []string{"Pod", "Service"} {
		t.Run(kind, func(t *testing.T) {
			pkg := guardPackage("owner", "Ready", "demo")
			informer, ws := topologyInformer(t, pkg), store.NewWaypointStore()
			handler := topologyHandler(kind, ws, informer)
			for _, entry := range []store.WaypointEntry{
				{Selector: map[string]string{"app": "demo"}, WaypointName: "wrong-waypoint"},
				{Selector: map[string]string{}, WaypointName: "demo-waypoint"},
			} {
				ws.SetForPackage("apps", "owner", []store.WaypointEntry{entry})
				if guardAdmission(t, handler, kind, admissionv1.Create, "tenant", guardObject(kind, "demo"), nil).Allowed {
					t.Fatal("Ready owner accepted a different published route", entry)
				}
			}
			ws.DeleteForPackage("apps", "owner")
			actual := guardObject(kind, "demo")
			topologyLabels(actual)["app.kubernetes.io/component"] = "ambient-waypoint"
			topologyLabels(actual)["gateway.networking.k8s.io/gateway-name"] = "demo-waypoint"
			if result := guardAdmission(t, handler, kind, admissionv1.Create, "tenant", actual, nil); !result.Allowed || len(result.Patch) != 0 {
				t.Fatal("source actual-waypoint shape could not repair unresolved topology")
			}
			delete(topologyLabels(actual), "gateway.networking.k8s.io/gateway-name")
			if guardAdmission(t, handler, kind, admissionv1.Create, "tenant", actual, nil).Allowed {
				t.Fatal("component-only label bypassed unresolved topology")
			}
		})
	}
}

func TestDeletingTopologyOwnerRemainsFencedUntilInformerDeletion(t *testing.T) {
	for _, kind := range []string{"Pod", "Service"} {
		t.Run(kind, func(t *testing.T) {
			pkg := guardPackage("owner", "Ready", "demo")
			deleted := metav1.Now()
			pkg.SetDeletionTimestamp(&deleted)
			informer, ws := topologyInformer(t, pkg), store.NewWaypointStore()
			handler := topologyHandler(kind, ws, informer)
			selected := guardObject(kind, "demo")
			if guardAdmission(t, handler, kind, admissionv1.Create, "tenant", selected, nil).Allowed {
				t.Fatal("finalization exposed selected traffic without a converged route")
			}
			ws.SetForPackage("apps", "owner", []store.WaypointEntry{{Selector: map[string]string{"app": "demo"}, WaypointName: "demo-waypoint"}})
			if result := guardAdmission(t, handler, kind, admissionv1.Create, "tenant", selected, nil); !result.Allowed || len(result.Patch) == 0 {
				t.Fatal("finalization removed retained routing before cleanup")
			}
			old := repairedTopologyObject(kind, selected)
			if result := guardAdmission(t, handler, kind, admissionv1.Update, topologyControllerActor, selected, old); !result.Allowed || len(result.Patch) != 0 {
				t.Fatal("finalization deadlocked exact owned label retirement")
			}
			if err := informer.GetStore().Delete(pkg); err != nil {
				t.Fatal(err)
			}
			if result := guardAdmission(t, handler, kind, admissionv1.Create, "tenant", selected, nil); !result.Allowed || len(result.Patch) != 0 {
				t.Fatal("deleted UID retained topology authority")
			}
		})
	}
}
