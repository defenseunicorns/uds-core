// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package webhook

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"

	admissionv1 "k8s.io/api/admission/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/serializer"
)

var (
	scheme = runtime.NewScheme()
	codecs = serializer.NewCodecFactory(scheme)
)

func init() {
	_ = admissionv1.AddToScheme(scheme)
}

// DenyClusterConfigDeletion returns an HTTP handler that denies DELETE operations on ClusterConfig resources.
func DenyClusterConfigDeletion() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(r.Body)
		if err != nil {
			slog.Error("Failed to read request body", "error", err)
			http.Error(w, "failed to read body", http.StatusBadRequest)
			return
		}

		review := &admissionv1.AdmissionReview{}
		if _, _, err := codecs.UniversalDeserializer().Decode(body, nil, review); err != nil {
			slog.Error("Failed to deserialize admission review", "error", err)
			http.Error(w, "failed to deserialize request", http.StatusBadRequest)
			return
		}

		req := review.Request
		if req == nil {
			slog.Error("Admission review has no request")
			http.Error(w, "missing admission request", http.StatusBadRequest)
			return
		}

		slog.Info("Denying ClusterConfig deletion", "name", req.Name, "user", req.UserInfo.Username)
		review.Response = &admissionv1.AdmissionResponse{
			UID:     req.UID,
			Allowed: false,
			Result: &metav1.Status{
				Message: "Deletion of ClusterConfig is not allowed",
			},
		}
		review.Request = nil

		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(review); err != nil {
			slog.Error("Failed to encode admission response", "error", err)
			http.Error(w, "failed to encode response", http.StatusInternalServerError)
		}
	}
}
