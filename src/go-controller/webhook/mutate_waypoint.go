// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package webhook

import (
	"encoding/json"
	"log/slog"
	"net/http"

	admissionv1 "k8s.io/api/admission/v1"
	"k8s.io/apimachinery/pkg/labels"

	"github.com/defenseunicorns/uds-core/src/go-controller/internal/store"
)

// rawObject is a minimal struct for extracting labels and spec.selector from admission objects.
type rawObject struct {
	Metadata struct {
		Labels map[string]string `json:"labels"`
	} `json:"metadata"`
	Spec struct {
		Selector map[string]string `json:"selector"`
	} `json:"spec"`
}

// MutatePodWaypoint returns an HTTP handler that labels pods with the appropriate
// istio.io/use-waypoint value when they are created in ambient namespaces with
// authservice-enabled SSO clients.
func MutatePodWaypoint(ws *store.WaypointStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		review, req, err := decodeAdmissionReview(r)
		if err != nil {
			slog.Error("Failed to decode admission review", "error", err)
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		var obj rawObject
		if err := json.Unmarshal(req.Object.Raw, &obj); err != nil {
			slog.Error("Failed to unmarshal pod object", "error", err)
			writeAdmissionAllow(w, review, req)
			return
		}

		// Skip waypoint pods
		if obj.Metadata.Labels["app.kubernetes.io/component"] == "ambient-waypoint" {
			writeAdmissionAllow(w, review, req)
			return
		}

		waypointName := findWaypointForLabels(ws, req.Namespace, obj.Metadata.Labels)
		if waypointName == "" {
			writeAdmissionAllow(w, review, req)
			return
		}

		slog.Debug("Adding waypoint label to pod", "namespace", req.Namespace, "name", req.Name, "waypoint", waypointName)

		merged := labels.Merge(obj.Metadata.Labels, map[string]string{
			"istio.io/use-waypoint": waypointName,
		})
		writeAdmissionPatch(w, review, req, merged)
	}
}

// MutateServiceWaypoint returns an HTTP handler that labels services with the appropriate
// istio.io/use-waypoint and istio.io/ingress-use-waypoint values when they are created
// or updated in ambient namespaces with authservice-enabled SSO clients.
func MutateServiceWaypoint(ws *store.WaypointStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		review, req, err := decodeAdmissionReview(r)
		if err != nil {
			slog.Error("Failed to decode admission review", "error", err)
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		var obj rawObject
		if err := json.Unmarshal(req.Object.Raw, &obj); err != nil {
			slog.Error("Failed to unmarshal service object", "error", err)
			writeAdmissionAllow(w, review, req)
			return
		}

		// Skip waypoint services
		if obj.Metadata.Labels["app.kubernetes.io/component"] == "ambient-waypoint" {
			writeAdmissionAllow(w, review, req)
			return
		}

		// For services, match against spec.selector (the pod selector the service targets)
		waypointName := findWaypointForLabels(ws, req.Namespace, obj.Spec.Selector)
		if waypointName == "" {
			writeAdmissionAllow(w, review, req)
			return
		}

		slog.Debug("Adding waypoint labels to service", "namespace", req.Namespace, "name", req.Name, "waypoint", waypointName)

		merged := labels.Merge(obj.Metadata.Labels, map[string]string{
			"istio.io/use-waypoint":         waypointName,
			"istio.io/ingress-use-waypoint": "true",
		})
		writeAdmissionPatch(w, review, req, merged)
	}
}

// findWaypointForLabels returns the waypoint name for the first store entry whose
// selector is an ALL-match subset of the given labels. Returns "" if no match.
func findWaypointForLabels(ws *store.WaypointStore, namespace string, objLabels map[string]string) string {
	for _, entry := range ws.Get(namespace) {
		// selector.Matches(labels.Set(pod.Labels))
		selector := labels.Set(entry.Selector).AsSelector()
		if selector.Matches(labels.Set(objLabels)) {
			return entry.WaypointName
		}
	}
	return ""
}

func writeAdmissionAllow(w http.ResponseWriter, review *admissionv1.AdmissionReview, req *admissionv1.AdmissionRequest) {
	writeAdmissionResponse(w, review, &admissionv1.AdmissionResponse{
		UID:     req.UID,
		Allowed: true,
	})
}

func writeAdmissionPatch(w http.ResponseWriter, review *admissionv1.AdmissionReview, req *admissionv1.AdmissionRequest, labels map[string]string) {
	patch := []map[string]interface{}{
		{
			"op":    "add",
			"path":  "/metadata/labels",
			"value": labels,
		},
	}
	patchBytes, err := json.Marshal(patch)
	if err != nil {
		slog.Error("Failed to marshal patch", "error", err)
		writeAdmissionAllow(w, review, req)
		return
	}

	patchType := admissionv1.PatchTypeJSONPatch
	writeAdmissionResponse(w, review, &admissionv1.AdmissionResponse{
		UID:       req.UID,
		Allowed:   true,
		Patch:     patchBytes,
		PatchType: &patchType,
	})
}
