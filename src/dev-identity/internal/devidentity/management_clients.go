// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package devidentity

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/google/uuid"
)

func clientPermitted(principal Principal, client ClientRecord) bool {
	if principal.Role == "fleet" {
		return client.Realm == "uds" && strings.HasPrefix(client.ClientID(), "fleet-")
	}
	return principal.Role == "admin" || (principal.Role == "operator" && client.Realm == "uds" && client.ClientID() != "uds-operator" && client.ClientID() != "account")
}

func readableClient(principal Principal, client ClientRecord) map[string]any {
	if principal.Role != "fleet" || clientPermitted(principal, client) {
		return client.Data
	}
	data := make(map[string]any, len(client.Data))
	for key, value := range client.Data {
		if key != "secret" {
			data[key] = value
		}
	}
	return data
}

func validateClient(data map[string]any) error {
	id, ok := data["clientId"].(string)
	if !ok || id == "" || len(id) > 255 || strings.ContainsAny(id, "\x00\r\n") {
		return fmt.Errorf("clientId is required")
	}
	if protocol, ok := data["protocol"].(string); ok && protocol != "" && protocol != "openid-connect" {
		return fmt.Errorf("only openid-connect is supported by Dex")
	}
	if method, _ := data["clientAuthenticatorType"].(string); method != "" && method != "client-secret" {
		return fmt.Errorf("unsupported OIDC client authentication method")
	}
	if _, err := interactiveDefaults(data); err != nil {
		return err
	}
	var mappings []struct {
		Mapper          string            `json:"protocolMapper"`
		Protocol        string            `json:"protocol"`
		ConsentRequired bool              `json:"consentRequired"`
		Config          map[string]string `json:"config"`
	}
	raw, err := json.Marshal(data["protocolMappers"])
	if err != nil || json.Unmarshal(raw, &mappings) != nil {
		return fmt.Errorf("invalid protocol mapper configuration")
	}
	for _, mapping := range mappings {
		publicID := data["publicClient"] == true && mapping.Protocol == "openid-connect" && !mapping.ConsentRequired && mapping.Config["id.token.claim"] == "true" && mapping.Config["access.token.claim"] == "false" && mapping.Config["included.client.audience"] != ""
		if publicID {
			for key := range mapping.Config {
				if key != "included.client.audience" && key != "id.token.claim" && key != "access.token.claim" {
					return fmt.Errorf("unsupported public audience mapper field")
				}
			}
		}
		serviceAccess := mapping.Config["access.token.claim"] == "true" && mapping.Config["id.token.claim"] != "true"
		if mapping.Mapper != "oidc-audience-mapper" || (!publicID && !serviceAccess) || mapping.Config["included.client.audience"] == "" {
			return fmt.Errorf("unsupported required token mapper")
		}
	}
	if _, exists := data["protocol"]; !exists {
		data["protocol"] = "openid-connect"
	}
	if _, exists := data["enabled"]; !exists {
		data["enabled"] = true
	}
	if _, exists := data["publicClient"]; !exists {
		data["publicClient"] = false
	}
	if _, exists := data["standardFlowEnabled"]; !exists {
		data["standardFlowEnabled"] = true
	}
	return nil
}

func (m *Management) routeClients(writer http.ResponseWriter, request *http.Request, principal Principal, realm string, rest []string) {
	if len(rest) == 0 {
		m.clientCollection(writer, request, principal, realm)
		return
	}
	client, err := m.Clients.Get(request.Context(), realm, rest[0])
	if err != nil {
		apiError(writer, 404, "client_not_found")
		return
	}
	if len(rest) > 1 {
		m.clientSubresource(writer, request, principal, client, rest[1:])
		return
	}
	if request.Method == http.MethodGet {
		jsonResponse(writer, 200, readableClient(principal, client))
		return
	}
	if !clientPermitted(principal, client) {
		apiError(writer, 403, "insufficient_scope")
		return
	}
	switch request.Method {
	case http.MethodPut:
		var data map[string]any
		if readJSON(request, &data) != nil {
			apiError(writer, 400, "invalid_client")
			return
		}
		for key, value := range data {
			client.Data[key] = value
		}
		client.Data["id"] = rest[0]
		if !clientPermitted(principal, client) {
			apiError(writer, 403, "insufficient_scope")
			return
		}
		if err := validateClient(client.Data); err != nil {
			apiError(writer, 400, err.Error())
			return
		}
		if err := m.authenticateCoreOwner(request.Context(), principal, &client); err != nil {
			apiError(writer, 403, err.Error())
			return
		}
		// A rename must remove the previous Dex ID before creating its successor.
		old, _ := m.Clients.Get(request.Context(), realm, rest[0])
		if old.ClientID() != client.ClientID() {
			if _, err := m.Clients.Find(request.Context(), realm, client.ClientID()); err == nil {
				apiError(writer, 409, "client_exists")
				return
			}
			if err := m.Clients.Delete(request.Context(), old); err != nil {
				apiError(writer, 503, "temporarily_unavailable")
				return
			}
		}
		if err := m.Clients.Save(request.Context(), client); err != nil {
			apiError(writer, 503, "temporarily_unavailable")
			return
		}
		m.event(realm, "UPDATE", "CLIENT", "clients/"+client.ID(), map[string]string{"clientId": client.ClientID()})
		writer.WriteHeader(204)
	case http.MethodDelete:
		if err := m.Clients.Delete(request.Context(), client); err != nil {
			apiError(writer, 503, "temporarily_unavailable")
			return
		}
		m.event(realm, "DELETE", "CLIENT", "clients/"+client.ID(), map[string]string{"clientId": client.ClientID()})
		writer.WriteHeader(204)
	default:
		writer.WriteHeader(405)
	}
}

func (m *Management) clientCollection(writer http.ResponseWriter, request *http.Request, principal Principal, realm string) {
	switch request.Method {
	case http.MethodGet:
		clients, err := m.Clients.List(request.Context(), realm)
		if err != nil {
			apiError(writer, 503, "temporarily_unavailable")
			return
		}
		result := []map[string]any{}
		for _, client := range clients {
			if filter := request.URL.Query().Get("clientId"); filter == "" || client.ClientID() == filter {
				result = append(result, readableClient(principal, client))
			}
		}
		jsonResponse(writer, 200, result)
	case http.MethodPost:
		var data map[string]any
		if readJSON(request, &data) != nil {
			apiError(writer, 400, "invalid_client")
			return
		}
		if err := validateClient(data); err != nil {
			apiError(writer, 400, err.Error())
			return
		}
		data["id"] = uuid.NewString()
		client := ClientRecord{Realm: realm, Data: data}
		if !clientPermitted(principal, client) {
			apiError(writer, 403, "insufficient_scope")
			return
		}
		if _, err := m.Clients.Find(request.Context(), realm, client.ClientID()); err == nil {
			apiError(writer, 409, "client_exists")
			return
		}
		if err := m.authenticateCoreOwner(request.Context(), principal, &client); err != nil {
			apiError(writer, 403, err.Error())
			return
		}
		if !client.Public() && client.Secret() == "" {
			secret, err := randomToken()
			if err != nil {
				apiError(writer, 503, "temporarily_unavailable")
				return
			}
			client.Data["secret"] = secret
		}
		if err := m.Clients.Save(request.Context(), client); err != nil {
			apiError(writer, 503, "temporarily_unavailable")
			return
		}
		writer.Header().Set("Location", "/admin/realms/"+realm+"/clients/"+client.ID())
		m.event(realm, "CREATE", "CLIENT", "clients/"+client.ID(), map[string]string{"clientId": client.ClientID()})
		writer.WriteHeader(201)
	default:
		writer.WriteHeader(405)
	}
}

func (m *Management) clientSubresource(writer http.ResponseWriter, request *http.Request, principal Principal, client ClientRecord, rest []string) {
	if len(rest) != 1 {
		apiError(writer, 404, "resource_not_found")
		return
	}
	switch rest[0] {
	case "client-secret":
		if !clientPermitted(principal, client) || client.Public() {
			apiError(writer, 403, "insufficient_scope")
			return
		}
		if request.Method == http.MethodPost {
			secret, err := randomToken()
			if err != nil {
				apiError(writer, 503, "temporarily_unavailable")
				return
			}
			client.Data["secret"] = secret
			if err := m.Clients.Save(request.Context(), client); err != nil {
				apiError(writer, 503, "temporarily_unavailable")
				return
			}
		} else if request.Method != http.MethodGet {
			writer.WriteHeader(405)
			return
		}
		jsonResponse(writer, 200, map[string]string{"type": "secret", "value": client.Secret()})
	case "service-account-user":
		if request.Method != http.MethodGet || !clientPermitted(principal, client) || client.Data["serviceAccountsEnabled"] != true {
			apiError(writer, 403, "insufficient_scope")
			return
		}
		jsonResponse(writer, 200, map[string]any{"id": "service-account-" + client.ID(), "username": "service-account-" + client.ClientID(), "enabled": client.Enabled()})
	default:
		apiError(writer, 404, "resource_not_found")
	}
}
