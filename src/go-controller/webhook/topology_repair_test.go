// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package webhook

import (
	"testing"

	"github.com/defenseunicorns/uds-core/src/go-controller/internal/store"
	admissionv1 "k8s.io/api/admission/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
)

const topologyControllerActor = "system:serviceaccount:uds-system:uds-controller"

func topologyLabels(object map[string]interface{}) map[string]interface{} {
	return object["metadata"].(map[string]interface{})["labels"].(map[string]interface{})
}

func repairedTopologyObject(kind string, old map[string]interface{}) map[string]interface{} {
	current := cloneMap(old)
	topologyLabels(current)["istio.io/use-waypoint"] = "demo-waypoint"
	if kind == "Service" {
		topologyLabels(current)["istio.io/ingress-use-waypoint"] = "true"
	}
	return current
}

func TestPendingTopologyControllerRepairCanPublishReady(t *testing.T) {
	for _, kind := range []string{"Pod", "Service"} {
		t.Run(kind, func(t *testing.T) {
			pkg := guardPackage("owner", "Pending", "demo")
			informer, ws := topologyInformer(t, pkg), store.NewWaypointStore()
			handler := topologyHandler(kind, ws, informer)
			old := guardObject(kind, "demo")
			current := repairedTopologyObject(kind, old)
			if result := guardAdmission(t, handler, kind, admissionv1.Update, topologyControllerActor, current, old); !result.Allowed || len(result.Patch) != 0 {
				t.Fatal("exact authenticated repair deadlocked before Ready", result)
			}
			for _, actor := range []string{"tenant", "system:serviceaccount:apps:uds-controller"} {
				if guardAdmission(t, handler, kind, admissionv1.Update, actor, current, old).Allowed {
					t.Fatal("untrusted actor forged a repair", actor)
				}
			}
			if guardAdmission(t, handler, kind, admissionv1.Create, topologyControllerActor, current, old).Allowed {
				t.Fatal("controller repair accidentally allowed CREATE")
			}
			negatives := []func(map[string]interface{}){
				func(o map[string]interface{}) { o["spec"].(map[string]interface{})["changed"] = true },
				func(o map[string]interface{}) { o["metadata"].(map[string]interface{})["uid"] = "replacement" },
				func(o map[string]interface{}) { o["metadata"].(map[string]interface{})["name"] = "other" },
				func(o map[string]interface{}) { topologyLabels(o)["unrelated"] = "change" },
				func(o map[string]interface{}) { topologyLabels(o)["istio.io/use-waypoint"] = "other-waypoint" },
			}
			if kind == "Service" {
				negatives = append(negatives, func(o map[string]interface{}) { topologyLabels(o)["istio.io/ingress-use-waypoint"] = "false" })
			}
			for _, change := range negatives {
				invalid := cloneMap(current)
				change(invalid)
				if guardAdmission(t, handler, kind, admissionv1.Update, topologyControllerActor, invalid, old).Allowed {
					t.Fatal("non-repair request crossed unresolved topology fence", invalid)
				}
			}
			ws.SetForPackage("apps", "owner", []store.WaypointEntry{{Selector: map[string]string{"app": "demo"}, WaypointName: "demo-waypoint"}})
			_ = unstructured.SetNestedField(pkg.Object, "Ready", "status", "phase")
			_ = informer.GetStore().Update(pkg)
			if !guardAdmission(t, handler, kind, admissionv1.Create, "tenant", guardObject(kind, "demo"), nil).Allowed {
				t.Fatal("converged publication did not release selected requests")
			}
		})
	}
}

func TestRetainedTopologyAllowsOnlyAuthenticatedOwnedRetirement(t *testing.T) {
	for _, kind := range []string{"Pod", "Service"} {
		t.Run(kind, func(t *testing.T) {
			pkg := guardPackage("owner", "Retrying", "")
			_ = unstructured.SetNestedSlice(pkg.Object, []interface{}{map[string]interface{}{"clientId": "demo", "selector": map[string]interface{}{"app": "demo"}}}, "status", "authserviceClients")
			informer, ws := topologyInformer(t, pkg), store.NewWaypointStore()
			ws.SetForPackage("apps", "owner", []store.WaypointEntry{{Selector: map[string]string{"app": "demo"}, WaypointName: "demo-waypoint"}})
			handler := topologyHandler(kind, ws, informer)
			old := repairedTopologyObject(kind, guardObject(kind, "demo"))
			current := cloneMap(old)
			delete(topologyLabels(current), "istio.io/use-waypoint")
			delete(topologyLabels(current), "istio.io/ingress-use-waypoint")
			if result := guardAdmission(t, handler, kind, admissionv1.Update, topologyControllerActor, current, old); !result.Allowed || len(result.Patch) != 0 {
				t.Fatal("owned retirement was overwritten by retained route", result)
			}
			if result := guardAdmission(t, handler, kind, admissionv1.Update, "tenant", current, old); !result.Allowed || len(result.Patch) == 0 {
				t.Fatal("ordinary actor removed retained topology")
			}
			// Historical ownership can authorize only exact controller retirement,
			// never an ordinary request or creation on a fresh replica.
			ws.DeleteForPackage("apps", "owner")
			if result := guardAdmission(t, handler, kind, admissionv1.Update, topologyControllerActor, current, old); !result.Allowed {
				t.Fatal("journal-correlated retirement was unavailable")
			}
			if guardAdmission(t, handler, kind, admissionv1.Update, "tenant", current, old).Allowed {
				t.Fatal("historical journal created ordinary topology authority")
			}
		})
	}
}

func TestDeletingTopologyRetiresPartiallyRepairedDesiredSelector(t *testing.T) {
	for _, kind := range []string{"Pod", "Service"} {
		t.Run(kind, func(t *testing.T) {
			pkg := guardPackage("owner", "Retrying", "new")
			_ = unstructured.SetNestedSlice(pkg.Object, []interface{}{map[string]interface{}{"clientId": "demo", "selector": map[string]interface{}{"app": "old"}}}, "status", "authserviceClients")
			informer, ws := topologyInformer(t, pkg), store.NewWaypointStore()
			ws.SetForPackage("apps", "owner", []store.WaypointEntry{{Selector: map[string]string{"app": "old"}, WaypointName: "demo-waypoint"}})
			handler := topologyHandler(kind, ws, informer)
			old := repairedTopologyObject(kind, guardObject(kind, "new"))
			current := cloneMap(old)
			delete(topologyLabels(current), "istio.io/use-waypoint")
			delete(topologyLabels(current), "istio.io/ingress-use-waypoint")
			if guardAdmission(t, handler, kind, admissionv1.Update, topologyControllerActor, current, old).Allowed {
				t.Fatal("unpublished desired route could be retired before deletion")
			}
			deleting := metav1.Now()
			pkg.SetDeletionTimestamp(&deleting)
			_ = informer.GetStore().Update(pkg)
			if result := guardAdmission(t, handler, kind, admissionv1.Update, topologyControllerActor, current, old); !result.Allowed || len(result.Patch) != 0 {
				t.Fatal("partially repaired desired selector deadlocked finalization", result)
			}
			if guardAdmission(t, handler, kind, admissionv1.Update, "tenant", current, old).Allowed {
				t.Fatal("tenant crossed the unresolved desired route fence")
			}
			if guardAdmission(t, handler, kind, admissionv1.Create, topologyControllerActor, guardObject(kind, "new"), nil).Allowed {
				t.Fatal("cleanup path granted ordinary desired routing authority")
			}
		})
	}
}
