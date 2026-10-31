// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package devidentity

import (
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"
)

type Management struct {
	Directory  ManagedDirectory
	Store      StateStore
	Clients    *Clients
	Sessions   *Sessions
	Authority  Authority
	PublicHost string
	AdminHost  string
	IssuerPath string
	Audit      io.Writer
	now        func() time.Time
	mutations  sync.Mutex
}

func NewManagement(directory ManagedDirectory, store StateStore, clients *Clients, sessions *Sessions, authority Authority, publicHost, adminHost string) *Management {
	return &Management{Directory: directory, Store: store, Clients: clients, Sessions: sessions, Authority: authority, PublicHost: publicHost, AdminHost: adminHost, IssuerPath: "/realms/uds", now: time.Now}
}

func jsonResponse(writer http.ResponseWriter, status int, value any) {
	writer.Header().Set("Content-Type", "application/json")
	writer.Header().Set("Cache-Control", "no-store")
	writer.WriteHeader(status)
	_ = json.NewEncoder(writer).Encode(value)
}

func apiError(writer http.ResponseWriter, status int, message string) {
	jsonResponse(writer, status, map[string]string{"error": message})
}

func readJSON(request *http.Request, target any) error {
	defer request.Body.Close()
	return json.NewDecoder(io.LimitReader(request.Body, 1024*1024)).Decode(target)
}

// ServeHTTP returns false only for real Dex protocol requests. Management
// paths always terminate here and require bridge-issued API authority.
func (m *Management) ServeHTTP(writer http.ResponseWriter, request *http.Request) bool {
	path := request.URL.Path
	if m.routeFrontend(writer, request) {
		return true
	}
	if strings.HasPrefix(path, "/realms/") && (strings.HasSuffix(path, "/protocol/openid-connect/token") || path == m.IssuerPath+"/token") {
		return m.routeToken(writer, request)
	}
	if !strings.HasPrefix(path, "/admin/realms/") {
		return false
	}
	principal, err := m.authorize(request)
	if err != nil {
		apiError(writer, 401, "invalid_token")
		return true
	}
	if request.Method != http.MethodGet {
		m.mutations.Lock()
		defer m.mutations.Unlock()
	}
	parts := strings.Split(strings.TrimPrefix(path, "/admin/realms/"), "/")
	if len(parts) < 2 || (parts[0] != "uds" && parts[0] != "master") {
		apiError(writer, 404, "realm_not_found")
		return true
	}
	if principal.Role != "admin" && parts[0] != "uds" {
		apiError(writer, 403, "insufficient_scope")
		return true
	}
	switch parts[1] {
	case "clients":
		m.routeClients(writer, request, principal, parts[0], parts[2:])
	case "users", "groups", "group-by-path":
		if principal.Role != "admin" {
			apiError(writer, 403, "insufficient_scope")
			return true
		}
		m.routeDirectory(writer, request, parts[0], parts[1:])
	case "authentication":
		if principal.Role != "admin" {
			apiError(writer, 403, "insufficient_scope")
			return true
		}
		m.routeAuthentication(writer, request, parts[0], parts[2:])
	default:
		apiError(writer, 404, "resource_not_found")
	}
	return true
}

func (m *Management) event(realm, operation, resource, path string, representation any) {
	if m.Audit == nil {
		return
	}
	_ = json.NewEncoder(m.Audit).Encode(map[string]any{"timestamp": m.now().UTC(), "loggerName": "uds.keycloak.plugin.eventListeners.JSONLogEventListenerProvider", "eventType": "ADMIN", "operationType": operation, "resourceType": resource, "resourcePath": path, "realmName": realm, "representation": representation})
}
