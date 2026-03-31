// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package webhook

import (
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"

	admissionv1 "k8s.io/api/admission/v1"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

const policyRequireNonRootUser = "RequireNonRootUser"

// ValidateNonRootUser returns an HTTP handler that denies pods running as root.
func ValidateNonRootUser(exemptions *ExemptionStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		review, req, err := decodeAdmissionReview(r)
		if err != nil {
			slog.Error("Failed to decode admission review", "error", err)
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		pod := &corev1.Pod{}
		if err := json.Unmarshal(req.Object.Raw, pod); err != nil {
			slog.Error("Failed to unmarshal pod", "error", err)
			http.Error(w, "failed to unmarshal pod", http.StatusBadRequest)
			return
		}

		// Fill in namespace/name from the request if not in the object
		if pod.Namespace == "" {
			pod.Namespace = req.Namespace
		}
		if pod.Name == "" {
			pod.Name = req.Name
		}

		response := &admissionv1.AdmissionResponse{UID: req.UID}

		if exemptions.IsExempt(pod, policyRequireNonRootUser) {
			slog.Info("Pod exempt from RequireNonRootUser", "name", pod.Name, "namespace", pod.Namespace)
			response.Allowed = true
		} else {
			allowed, message := validateNonRootUser(pod)
			response.Allowed = allowed
			if !allowed {
				slog.Info("Denying pod: RequireNonRootUser", "name", pod.Name, "namespace", pod.Namespace, "reason", message)
				response.Result = &metav1.Status{Message: message}
			}
		}

		writeAdmissionResponse(w, review, response)
	}
}

// MutateNonRootUser returns an HTTP handler that sets safe security context defaults on pods.
func MutateNonRootUser(exemptions *ExemptionStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		review, req, err := decodeAdmissionReview(r)
		if err != nil {
			slog.Error("Failed to decode admission review", "error", err)
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		pod := &corev1.Pod{}
		if err := json.Unmarshal(req.Object.Raw, pod); err != nil {
			slog.Error("Failed to unmarshal pod", "error", err)
			http.Error(w, "failed to unmarshal pod", http.StatusBadRequest)
			return
		}

		if pod.Namespace == "" {
			pod.Namespace = req.Namespace
		}
		if pod.Name == "" {
			pod.Name = req.Name
		}

		response := &admissionv1.AdmissionResponse{
			UID:     req.UID,
			Allowed: true,
		}

		if !exemptions.IsExempt(pod, policyRequireNonRootUser) {
			patches := setNonRootUserDefaults(pod)
			if len(patches) > 0 {
				patchBytes, err := json.Marshal(patches)
				if err != nil {
					slog.Error("Failed to marshal patches", "error", err)
					http.Error(w, "failed to marshal patches", http.StatusInternalServerError)
					return
				}
				patchType := admissionv1.PatchTypeJSONPatch
				response.PatchType = &patchType
				response.Patch = patchBytes
				slog.Debug("Mutating pod: RequireNonRootUser", "name", pod.Name, "namespace", pod.Namespace, "patches", len(patches))
			}
		}

		writeAdmissionResponse(w, review, response)
	}
}

// decodeAdmissionReview reads and deserializes an AdmissionReview from the request.
func decodeAdmissionReview(r *http.Request) (*admissionv1.AdmissionReview, *admissionv1.AdmissionRequest, error) {
	body, err := io.ReadAll(r.Body)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to read body: %w", err)
	}

	review := &admissionv1.AdmissionReview{}
	if _, _, err := codecs.UniversalDeserializer().Decode(body, nil, review); err != nil {
		return nil, nil, fmt.Errorf("failed to deserialize request: %w", err)
	}

	if review.Request == nil {
		return nil, nil, fmt.Errorf("missing admission request")
	}

	return review, review.Request, nil
}

// writeAdmissionResponse serializes and writes the AdmissionReview response.
func writeAdmissionResponse(w http.ResponseWriter, review *admissionv1.AdmissionReview, response *admissionv1.AdmissionResponse) {
	review.Response = response
	review.Request = nil

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(review); err != nil {
		slog.Error("Failed to encode admission response", "error", err)
		http.Error(w, "failed to encode response", http.StatusInternalServerError)
	}
}
