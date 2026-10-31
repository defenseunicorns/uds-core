// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package webhook

import (
	"encoding/json"
	"net/http"

	"github.com/defenseunicorns/uds-core/src/go-controller/internal/admission/resources"
	"github.com/defenseunicorns/uds-core/src/go-controller/internal/config"
	admissionv1 "k8s.io/api/admission/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/client-go/tools/cache"
)

func ValidateResources(packageInformer cache.SharedIndexInformer) http.HandlerFunc {
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
		cfg := config.Get()
		message := "Unsupported custom resource " + req.Kind.Kind
		switch req.Kind.Kind {
		case "Package":
			if packageInformer == nil || !packageInformer.HasSynced() {
				http.Error(w, "Package admission cache has not synchronized", http.StatusServiceUnavailable)
				return
			}
			existing := []resources.Object{}
			for _, item := range packageInformer.GetStore().List() {
				if r.Context().Err() != nil {
					http.Error(w, r.Context().Err().Error(), http.StatusServiceUnavailable)
					return
				}
				value, ok := item.(*unstructured.Unstructured)
				if !ok {
					http.Error(w, "Unexpected Package admission cache object", http.StatusServiceUnavailable)
					return
				}
				raw, err := json.Marshal(value.Object)
				if err != nil {
					http.Error(w, err.Error(), http.StatusServiceUnavailable)
					return
				}
				decoded, err := resources.Decode(raw)
				if err != nil {
					http.Error(w, err.Error(), http.StatusServiceUnavailable)
					return
				}
				existing = append(existing, decoded)
			}
			old, _ := resources.Decode(req.OldObject.Raw)
			message = resources.ValidatePackage(object, old, existing, resources.Config{Domain: cfg.Domain, AdminDomain: cfg.AdminDomain, AllowPublicClients: cfg.AllowPublicClients})
		case "Exemption":
			message = resources.ValidateExemption(object, cfg.AllowAllNSExemptions)
		case "ClusterConfig":
			message = resources.ValidateClusterConfig(object)
		}
		response := &admissionv1.AdmissionResponse{UID: req.UID, Allowed: message == ""}
		if message != "" {
			response.Result = &metav1.Status{Message: message}
		}
		writeAdmissionResponse(w, review, response)
	}
}
