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
	jsonpatch "gopkg.in/evanphx/json-patch.v4"
	admissionv1 "k8s.io/api/admission/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
)

func topologyAdmission(t *testing.T, handler http.HandlerFunc, kind string, operation admissionv1.Operation, object map[string]interface{}) (*admissionv1.AdmissionResponse, map[string]interface{}) {
	t.Helper()
	raw, _ := json.Marshal(object)
	review := admissionv1.AdmissionReview{TypeMeta: metav1.TypeMeta{APIVersion: "admission.k8s.io/v1", Kind: "AdmissionReview"}, Request: &admissionv1.AdmissionRequest{UID: "waypoint-test", Namespace: "apps", Name: "workload", Operation: operation, Kind: metav1.GroupVersionKind{Version: "v1", Kind: kind}, Object: runtime.RawExtension{Raw: raw}}}
	body, _ := json.Marshal(review)
	recorder := httptest.NewRecorder()
	handler(recorder, httptest.NewRequest(http.MethodPost, "/mutate-waypoint", bytes.NewReader(body)))
	if recorder.Code != http.StatusOK {
		t.Fatal(recorder.Code, recorder.Body.String())
	}
	var result admissionv1.AdmissionReview
	if err := json.Unmarshal(recorder.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	if result.Response == nil || !result.Response.Allowed || result.Response.UID != review.Request.UID {
		t.Fatal("topology admission did not return a valid response", result.Response)
	}
	if len(result.Response.Patch) > 0 {
		patch, err := jsonpatch.DecodePatch(result.Response.Patch)
		if err != nil {
			t.Fatal(err)
		}
		raw, err = patch.Apply(raw)
		if err != nil {
			t.Fatal(err)
		}
	}
	var admitted map[string]interface{}
	if err := json.Unmarshal(raw, &admitted); err != nil {
		t.Fatal(err)
	}
	return result.Response, admitted
}

func TestWaypointMutationPreservesSourceShapeAndUpdateContract(t *testing.T) {
	ws := store.NewWaypointStore()
	ws.Set("apps", []store.WaypointEntry{{Selector: map[string]string{"app": "demo"}, WaypointName: "demo-waypoint"}})
	cases := []struct {
		name, component, gateway string
		skip                     bool
	}{
		{"ordinary selected resource", "", "", false},
		{"forged component label alone", "ambient-waypoint", "", false},
		{"component plus unrelated gateway", "ambient-waypoint", "ordinary", false},
		{"gateway label alone", "", "demo-waypoint", false},
		{"pinned actual waypoint shape", "ambient-waypoint", "demo-waypoint", true},
	}
	for _, kind := range []string{"Pod", "Service"} {
		for _, operation := range []admissionv1.Operation{admissionv1.Create, admissionv1.Update} {
			for _, test := range cases {
				t.Run(kind+"/"+string(operation)+"/"+test.name, func(t *testing.T) {
					labels := map[string]interface{}{"app": "demo", "unrelated": "preserve"}
					if test.component != "" {
						labels["app.kubernetes.io/component"] = test.component
					}
					if test.gateway != "" {
						labels["gateway.networking.k8s.io/gateway-name"] = test.gateway
					}
					object := map[string]interface{}{"metadata": map[string]interface{}{"labels": labels}, "spec": map[string]interface{}{"selector": map[string]interface{}{"app": "demo"}}}
					handler := MutatePodWaypoint(ws)
					if kind == "Service" {
						handler = MutateServiceWaypoint(ws)
					}
					response, admitted := topologyAdmission(t, handler, kind, operation, object)
					resultLabels := admitted["metadata"].(map[string]interface{})["labels"].(map[string]interface{})
					if test.skip {
						if len(response.Patch) != 0 || resultLabels["istio.io/use-waypoint"] != nil {
							t.Fatal("actual waypoint shape was recursively routed")
						}
						return
					}
					if resultLabels["istio.io/use-waypoint"] != "demo-waypoint" || resultLabels["unrelated"] != "preserve" {
						t.Fatal("ordinary or component-forged resource avoided source routing", resultLabels)
					}
					if kind == "Service" && resultLabels["istio.io/ingress-use-waypoint"] != "true" {
						t.Fatal("service did not acquire ingress waypoint label")
					}
					second, _ := topologyAdmission(t, handler, kind, admissionv1.Update, admitted)
					if len(second.Patch) != 0 {
						t.Fatal("unchanged update was not idempotent")
					}
					delete(resultLabels, "istio.io/use-waypoint")
					_, repaired := topologyAdmission(t, handler, kind, admissionv1.Update, admitted)
					if repaired["metadata"].(map[string]interface{})["labels"].(map[string]interface{})["istio.io/use-waypoint"] != "demo-waypoint" {
						t.Fatal("update did not repair removed source-required routing")
					}
				})
			}
		}
	}
}
