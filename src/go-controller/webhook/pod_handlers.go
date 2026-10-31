// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package webhook

import (
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"

	compiledexemptions "github.com/defenseunicorns/uds-core/src/go-controller/internal/admission/exemptions"
	"github.com/defenseunicorns/uds-core/src/go-controller/internal/admission/policies"
	"github.com/defenseunicorns/uds-core/src/go-controller/internal/admission/resources"
	admissionv1 "k8s.io/api/admission/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

const (
	nativeMutationRevisionAnnotation    = "policy.uds.dev/native-mutation-revision"
	policyRequireNonRootUser            = "RequireNonRootUser"
	policyRestrictIstioUser             = "RestrictIstioUser"
	policyRestrictIstioSidecarOverrides = "RestrictIstioSidecarOverrides"
	policyRestrictIstioTrafficOverrides = "RestrictIstioTrafficOverrides"
	policyRestrictIstioAmbientOverrides = "RestrictIstioAmbientOverrides"
)

// ValidatePod serves the complete fallback contract for Pods and Services. Broad
// registration first qualifies parity. Narrow registration invokes it for the
// protected control-plane namespace, trusted-container classification, and
// native-routed JavaScript-only scopes; the handler always checks all policies.
func ValidatePod(exemptions *ExemptionStore) http.HandlerFunc {
	return policyHandler(exemptions, false)
}

// MutateNonRootUser serves defaults and non-authoritative diagnostics. It never
// treats tenant-provided policy annotations as an authorization grant.
func MutateNonRootUser(exemptions *ExemptionStore) http.HandlerFunc {
	return policyHandler(exemptions, true)
}

func policyHandler(exemptions *ExemptionStore, mutate bool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		review, req, err := decodeAdmissionReview(r)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		object, err := admissionObject(req)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		service := req.Kind.Kind == "Service" || req.Resource.Resource == "services"
		metadata := object.Object("metadata")
		exempt, revision, snapshotReady := exemptions.MetadataSnapshot(metadata)
		response := &admissionv1.AdmissionResponse{UID: req.UID, Allowed: true}
		nativeRevision := metadata.Object("annotations").String(nativeMutationRevisionAnnotation)
		if nativeRevision != "" && (!snapshotReady || revision != nativeRevision) {
			response.Allowed = false
			response.Result = &metav1.Status{Reason: metav1.StatusReasonConflict, Code: http.StatusConflict, Message: "Admission exemption snapshot changed between native mutation and Go fallback; retry the request"}
			writeAdmissionResponse(w, review, response)
			return
		}
		if mutate {
			patches, err := policies.Mutate(object, service, exempt)
			if err != nil {
				response.Allowed = false
				response.Result = &metav1.Status{Message: err.Error()}
			} else if len(patches) > 0 {
				patch, err := json.Marshal(patches)
				if err != nil {
					http.Error(w, err.Error(), http.StatusInternalServerError)
					return
				}
				patchType := admissionv1.PatchTypeJSONPatch
				response.PatchType, response.Patch = &patchType, patch
			}
		} else {
			for _, policy := range compiledexemptions.Policies {
				servicePolicy := policy == "RestrictExternalNames" || policy == "DisallowNodePortServices"
				if service != servicePolicy || exempt(policy) {
					continue
				}
				if message := policies.Validate(policy, object); message != "" {
					response.Allowed = false
					response.Result = &metav1.Status{Message: message}
					break
				}
			}
		}
		writeAdmissionResponse(w, review, response)
	}
}

func admissionObject(req *admissionv1.AdmissionRequest) (resources.Object, error) {
	object, err := resources.Decode(req.Object.Raw)
	if err != nil {
		return nil, err
	}
	metadata := object.Object("metadata")
	if metadata == nil {
		metadata = resources.Object{}
	}
	if metadata.String("namespace") == "" && req.Namespace != "" {
		raw, _ := json.Marshal(req.Namespace)
		metadata["namespace"] = raw
	}
	if metadata.String("name") == "" && req.Name != "" {
		raw, _ := json.Marshal(req.Name)
		metadata["name"] = raw
	}
	raw, err := json.Marshal(metadata)
	if err != nil {
		return nil, err
	}
	object["metadata"] = raw
	return object, nil
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
