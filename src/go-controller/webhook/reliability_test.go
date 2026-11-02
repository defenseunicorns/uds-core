// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package webhook

import (
	"bytes"
	"context"
	"encoding/json"
	"github.com/defenseunicorns/uds-core/src/go-controller/internal/store"
	admissionv1 "k8s.io/api/admission/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/client-go/kubernetes/fake"
	ktesting "k8s.io/client-go/testing"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func invokeReview(t *testing.T, handler http.HandlerFunc, request *admissionv1.AdmissionRequest) *admissionv1.AdmissionResponse {
	t.Helper()
	body, _ := json.Marshal(admissionv1.AdmissionReview{TypeMeta: metav1.TypeMeta{APIVersion: "admission.k8s.io/v1", Kind: "AdmissionReview"}, Request: request})
	recorder := httptest.NewRecorder()
	handler(recorder, httptest.NewRequest(http.MethodPost, "/", bytes.NewReader(body)))
	var review admissionv1.AdmissionReview
	if err := json.Unmarshal(recorder.Body.Bytes(), &review); err != nil {
		t.Fatal(recorder.Code, recorder.Body.String())
	}
	return review.Response
}
func TestEphemeralContainerIgnoresOldStampButStillEnforcesPolicy(t *testing.T) {
	exemptions := NewExemptionStore()
	exemptions.Replace(nil, false)
	for _, privileged := range []bool{false, true} {
		object := map[string]interface{}{"metadata": map[string]interface{}{"name": "debug", "namespace": "apps", "annotations": map[string]string{nativeMutationRevisionAnnotation: "old"}}, "spec": map[string]interface{}{"securityContext": map[string]interface{}{"runAsNonRoot": true, "runAsUser": 1000}, "containers": []interface{}{map[string]interface{}{"name": "app", "securityContext": map[string]interface{}{"allowPrivilegeEscalation": false, "capabilities": map[string]interface{}{"drop": []string{"ALL"}}}}}, "ephemeralContainers": []interface{}{map[string]interface{}{"name": "debugger", "securityContext": map[string]interface{}{"privileged": privileged, "allowPrivilegeEscalation": false, "capabilities": map[string]interface{}{"drop": []string{"ALL"}}}}}}}
		raw, _ := json.Marshal(object)
		req := &admissionv1.AdmissionRequest{UID: "debug", SubResource: "ephemeralcontainers", Operation: admissionv1.Update, Kind: metav1.GroupVersionKind{Kind: "Pod"}, Resource: metav1.GroupVersionResource{Resource: "pods"}, Object: runtime.RawExtension{Raw: raw}}
		response := invokeReview(t, ValidatePod(exemptions), req)
		if response.Allowed == privileged {
			t.Fatalf("privileged=%v: %v", privileged, response.Result)
		}
	}
}
func TestWaypointMalformedObjectDenies(t *testing.T) {
	req := &admissionv1.AdmissionRequest{UID: "bad", Object: runtime.RawExtension{Raw: []byte(`{"metadata":{"labels":42}}`)}}
	for _, handler := range []http.HandlerFunc{MutatePodWaypoint(store.NewWaypointStore()), MutateServiceWaypoint(store.NewWaypointStore())} {
		if invokeReview(t, handler, req).Allowed {
			t.Fatal("malformed object allowed")
		}
	}
}
func TestAdmissionBodyBounded(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(strings.Repeat(" ", maxAdmissionBodyBytes+1)))
	if _, _, err := decodeAdmissionReview(req); err == nil || !strings.Contains(err.Error(), "exceeds") {
		t.Fatal("unbounded body", err)
	}
}
func TestServingWatchesAreNameScoped(t *testing.T) {
	client := fake.NewClientset()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	manager := &ServingManager{client: client}
	manager.watch(ctx)
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		count := 0
		for _, action := range client.Actions() {
			if action.GetVerb() != "list" {
				continue
			}
			list := action.(ktesting.ListAction)
			name, ok := list.GetListRestrictions().Fields.RequiresExactMatch("metadata.name")
			if !ok || name == "" {
				t.Fatal("unfiltered serving informer", action.GetResource())
			}
			count++
		}
		if count >= 8 {
			return
		}
		time.Sleep(time.Millisecond)
	}
	t.Fatal("serving watches did not start")
}
func TestParameterProtectionIdentityAndTeardown(t *testing.T) {
	_, validations := nativeExpressions(t, "uds-native-controller-parameters")
	for _, test := range []struct {
		identity, operation string
		allowed             bool
	}{
		{"system:serviceaccount:uds-system:uds-controller", "CREATE", true},
		{"system:serviceaccount:uds-system:uds-controller", "UPDATE", true},
		{"tenant", "UPDATE", false}, {"tenant", "DELETE", false},
		{"system:serviceaccount:kube-system:namespace-controller", "DELETE", true},
		{"system:serviceaccount:kube-system:namespace-controller", "UPDATE", false},
	} {
		actual := evalNative(t, validations[0], map[string]interface{}{"request": map[string]interface{}{"operation": test.operation, "userInfo": map[string]interface{}{"username": test.identity}}})
		if actual != test.allowed {
			t.Fatalf("%+v got %v", test, actual)
		}
	}
}

func TestServingManagerRepairsFromWatchWithoutSteadyPolling(t *testing.T) {
	client, _ := planFixture(t, true)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	manager, err := newServingManager(ctx, client)
	if err != nil {
		t.Fatal(err)
	}
	done := make(chan struct{})
	go func() { manager.Run(ctx); close(done) }()
	defer func() { cancel(); <-done }()
	deadline := time.Now().Add(2 * time.Second)
	for !manager.registered.Load() {
		if time.Now().After(deadline) {
			t.Fatal("serving manager not registered")
		}
		time.Sleep(time.Millisecond)
	}
	// Allow events from the one-time activation annotation to settle.
	time.Sleep(300 * time.Millisecond)
	client.ClearActions()
	time.Sleep(2100 * time.Millisecond)
	for _, action := range client.Actions() {
		if action.GetVerb() == "get" {
			t.Fatal("steady serving manager polled the API", action.GetResource())
		}
	}
	if err := client.AdmissionregistrationV1().ValidatingWebhookConfigurations().Delete(ctx, "uds-controller-pods", metav1.DeleteOptions{}); err != nil {
		t.Fatal(err)
	}
	deadline = time.Now().Add(1500 * time.Millisecond)
	for {
		_, err := client.AdmissionregistrationV1().ValidatingWebhookConfigurations().Get(ctx, "uds-controller-pods", metav1.GetOptions{})
		if err == nil {
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("watch did not repair registration", err)
		}
		time.Sleep(time.Millisecond)
	}
}
