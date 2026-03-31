// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package webhook

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	admissionv1 "k8s.io/api/admission/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/types"
)

func newAdmissionReview() *admissionv1.AdmissionReview {
	return &admissionv1.AdmissionReview{
		TypeMeta: metav1.TypeMeta{
			APIVersion: "admission.k8s.io/v1",
			Kind:       "AdmissionReview",
		},
		Request: &admissionv1.AdmissionRequest{
			UID:  types.UID("test-uid"),
			Name: "uds-cluster-config",
		},
	}
}

func sendReview(t *testing.T, handler http.HandlerFunc, body []byte) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, "/validate-clusterconfig-delete", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	return rec
}

func TestRequestIsDenied(t *testing.T) {
	review := newAdmissionReview()
	body, err := json.Marshal(review)
	if err != nil {
		t.Fatal(err)
	}

	rec := sendReview(t, DenyClusterConfigDeletion(), body)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}

	var resp admissionv1.AdmissionReview
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatal(err)
	}

	if resp.Response.Allowed {
		t.Fatal("expected request to be denied")
	}
	if resp.Response.UID != "test-uid" {
		t.Fatalf("expected UID test-uid, got %s", resp.Response.UID)
	}
	if resp.Response.Result == nil || resp.Response.Result.Message != "Deletion of ClusterConfig is not allowed" {
		t.Fatalf("unexpected denial message: %v", resp.Response.Result)
	}
}

func TestMalformedBodyReturns400(t *testing.T) {
	rec := sendReview(t, DenyClusterConfigDeletion(), []byte("not json"))
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
}

func TestEmptyBodyReturns400(t *testing.T) {
	rec := sendReview(t, DenyClusterConfigDeletion(), []byte{})
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
}

func TestMissingRequestReturns400(t *testing.T) {
	review := &admissionv1.AdmissionReview{
		TypeMeta: metav1.TypeMeta{
			APIVersion: "admission.k8s.io/v1",
			Kind:       "AdmissionReview",
		},
	}
	body, err := runtime.Encode(codecs.LegacyCodec(admissionv1.SchemeGroupVersion), review)
	if err != nil {
		t.Fatal(err)
	}

	rec := sendReview(t, DenyClusterConfigDeletion(), body)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
}
