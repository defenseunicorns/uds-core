// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package webhook

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/defenseunicorns/uds-core/src/go-controller/internal/admission/policies"
	"github.com/defenseunicorns/uds-core/src/go-controller/internal/admission/resources"
	jsonpatch "gopkg.in/evanphx/json-patch.v4"
	admissionv1 "k8s.io/api/admission/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
)

func callPodHandler(t *testing.T, handler http.HandlerFunc, raw []byte) *admissionv1.AdmissionResponse {
	t.Helper()
	review := admissionv1.AdmissionReview{TypeMeta: metav1.TypeMeta{APIVersion: "admission.k8s.io/v1", Kind: "AdmissionReview"}, Request: &admissionv1.AdmissionRequest{UID: "request", Kind: metav1.GroupVersionKind{Version: "v1", Kind: "Pod"}, Resource: metav1.GroupVersionResource{Version: "v1", Resource: "pods"}, Namespace: "uds-system", Name: "ordinary-workload", Object: runtime.RawExtension{Raw: raw}, Operation: admissionv1.Create}}
	body, err := json.Marshal(review)
	if err != nil {
		t.Fatal(err)
	}
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, httptest.NewRequest(http.MethodPost, "/validate-pods", bytes.NewReader(body)))
	if recorder.Code != http.StatusOK {
		t.Fatal(recorder.Code, recorder.Body.String())
	}
	var returned admissionv1.AdmissionReview
	if err := json.Unmarshal(recorder.Body.Bytes(), &returned); err != nil {
		t.Fatal(err)
	}
	return returned.Response
}

func TestCompleteOrdinarySystemNamespaceContract(t *testing.T) {
	store := NewExemptionStore()
	object := []byte(`{"metadata":{"name":"ordinary-workload","namespace":"uds-system","annotations":{"uds-core.pepr.dev/uds-core-policies.DisallowPrivileged":"exempted"}},"spec":{"securityContext":{"runAsNonRoot":true,"runAsUser":1000,"runAsGroup":1000},"containers":[{"name":"app","image":"example/app:1","securityContext":{"allowPrivilegeEscalation":true,"privileged":true,"capabilities":{"drop":["ALL"]}}}]}}`)
	if result := callPodHandler(t, ValidatePod(store), object); result.Allowed {
		t.Fatal("tenant marker granted permission in protected system namespace")
	}
	if err := store.Set("owner", []ExemptionEntry{{Namespace: "uds-system", Name: "^ordinary-.*$", Policies: []string{"DisallowPrivileged"}}}); err != nil {
		t.Fatal(err)
	}
	if result := callPodHandler(t, ValidatePod(store), object); !result.Allowed {
		t.Fatal("complete system fallback ignored real exemption", result.Result)
	}
	store.Remove("owner")
	if result := callPodHandler(t, ValidatePod(store), object); result.Allowed {
		t.Fatal("revoked exemption retained permission")
	}
}

func TestDefaultsAreCompleteAndIdempotent(t *testing.T) {
	object, err := resources.Decode([]byte(`{"metadata":{"name":"ordinary-workload","namespace":"uds-system"},"spec":{"containers":[{"name":"app","image":"example/app:1"}],"initContainers":[{"name":"init","image":"example/init:1"}],"ephemeralContainers":[{"name":"debug","image":"example/debug:1"}]}}`))
	if err != nil {
		t.Fatal(err)
	}
	patches, err := policies.Mutate(object, false, func(string) bool { return false })
	if err != nil {
		t.Fatal(err)
	}
	encoded, _ := json.Marshal(patches)
	raw, _ := json.Marshal(object)
	patch, err := jsonpatch.DecodePatch(encoded)
	if err != nil {
		t.Fatal(err)
	}
	mutated, err := patch.Apply(raw)
	if err != nil {
		t.Fatal(err)
	}
	final, err := resources.Decode(mutated)
	if err != nil {
		t.Fatal(err)
	}
	for _, policy := range []string{"DisallowPrivileged", "RequireNonRootUser", "DropAllCapabilities", "RestrictCapabilities"} {
		if message := policies.Validate(policy, final); message != "" {
			t.Fatal(policy, message)
		}
	}
	second, err := policies.Mutate(final, false, func(string) bool { return false })
	if err != nil {
		t.Fatal(err)
	}
	if len(second) != 0 {
		t.Fatalf("reinvocation was not idempotent: %v", second)
	}
}

func TestGrantEvaluatorPinsOneRevision(t *testing.T) {
	store := NewExemptionStore()
	if err := store.Set("owner", []ExemptionEntry{{Namespace: "uds-system", Name: "ordinary", Policies: []string{"DisallowPrivileged"}}}); err != nil {
		t.Fatal(err)
	}
	pinned := store.Evaluator("uds-system", "ordinary", "")
	if err := store.Set("owner", []ExemptionEntry{{Namespace: "uds-system", Name: "ordinary", Policies: []string{"RequireNonRootUser"}}}); err != nil {
		t.Fatal(err)
	}
	if !pinned("DisallowPrivileged") || pinned("RequireNonRootUser") {
		t.Fatal("one request combined permission from two revisions")
	}
	fresh := store.Evaluator("uds-system", "ordinary", "")
	if fresh("DisallowPrivileged") || !fresh("RequireNonRootUser") {
		t.Fatal("next request did not observe new revision")
	}
}
