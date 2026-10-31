// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package webhook

import (
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
		review, req, err := decodeAdmissionReview(r)
		if err != nil {
			slog.Error("Failed to decode admission review", "error", err)
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		slog.Info("Denying ClusterConfig deletion", "name", req.Name, "user", req.UserInfo.Username)
		writeAdmissionResponse(w, review, &admissionv1.AdmissionResponse{
			UID:     req.UID,
			Allowed: false,
			Result: &metav1.Status{
				Message: "Deletion of ClusterConfig is not allowed",
			},
		})
	}
}
