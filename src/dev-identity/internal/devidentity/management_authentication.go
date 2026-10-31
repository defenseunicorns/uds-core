// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package devidentity

import (
	"net/http"
	"strings"
)

// The local development directory implements username/password authentication.
// Core's unchanged setup task explicitly disables its optional OTP execution.
// Persist that supported configuration; reject any request to enable an
// authentication mechanism this development provider cannot enforce.
func (m *Management) routeAuthentication(writer http.ResponseWriter, request *http.Request, realm string, rest []string) {
	if strings.Join(rest, "/") != "flows/Authentication/executions" {
		apiError(writer, 404, "flow_not_found")
		return
	}
	const executionID = "uds-dev-conditional-otp"
	switch request.Method {
	case http.MethodGet:
		jsonResponse(writer, 200, []map[string]any{{"id": executionID, "displayName": "Conditional OTP", "requirement": "DISABLED", "requirementChoices": []string{"DISABLED"}, "authenticator": "auth-conditional-otp-form"}})
	case http.MethodPut:
		var data struct {
			ID          string `json:"id"`
			Requirement string `json:"requirement"`
		}
		if readJSON(request, &data) != nil || data.ID != executionID || data.Requirement != "DISABLED" {
			apiError(writer, 400, "unsupported_authentication_execution")
			return
		}
		if err := m.Store.Put(request.Context(), "flow", realm+"/"+executionID, data); err != nil {
			apiError(writer, 503, "temporarily_unavailable")
			return
		}
		m.event(realm, "UPDATE", "AUTH_EXECUTION", "authentication/flows/Authentication/executions", data)
		writer.WriteHeader(204)
	default:
		writer.WriteHeader(405)
	}
}
