// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package webhook

import (
	"github.com/defenseunicorns/uds-core/src/go-controller/internal/admission/decisionmetrics"
	admissionv1 "k8s.io/api/admission/v1"
	"log/slog"
	"net/http"
	"strconv"
)

type decisionWriter struct {
	http.ResponseWriter
	handler, policy string
	recorded        bool
}

func observeDecisions(handler string, next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		writer := &decisionWriter{ResponseWriter: w, handler: handler, policy: "none"}
		next(writer, r)
		if !writer.recorded {
			decisionmetrics.Decisions.WithLabelValues(handler, "false", "internal-error").Inc()
		}
	}
}
func decisionPolicy(w http.ResponseWriter, policy string) {
	if writer, ok := w.(*decisionWriter); ok {
		writer.policy = policy
	}
}
func recordDecision(w http.ResponseWriter, req *admissionv1.AdmissionRequest, response *admissionv1.AdmissionResponse) {
	writer, ok := w.(*decisionWriter)
	if !ok || writer.recorded {
		return
	}
	writer.recorded = true
	decisionmetrics.Decisions.WithLabelValues(writer.handler, strconv.FormatBool(response.Allowed), writer.policy).Inc()
	if !response.Allowed && req != nil {
		slog.Warn("Admission denied", "handler", writer.handler, "namespace", req.Namespace, "name", req.Name, "kind", req.Kind.Kind, "policy", writer.policy)
	}
}
