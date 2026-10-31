// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package devidentity

import (
	"bytes"
	"crypto/subtle"
	"encoding/json"
	"html/template"
	"net/http"
	"net/http/httptest"
	"strings"
	"time"
)

const adminCookie = "UDS_IDENTITY_ADMIN"

var consoleTemplate = template.Must(template.New("console").Parse(`<!doctype html>
<html lang="en"><meta charset="utf-8"><title>UDS identity administration</title>
<main><h1>UDS identity administration</h1><p>Dex provides OpenID Connect. The development management API manages persistent users, groups, and clients.</p>
<form method="post" action="/admin/dev/login"><label>Username<input name="username" autocomplete="username" required></label><label>Password<input name="password" type="password" autocomplete="current-password" required></label><input type="hidden" name="csrf" value="{{.CSRF}}"><button>Sign In</button></form>
<script type="application/json" id="identity-config">{{.Config}}</script></main></html>`))

var administrationTemplate = template.Must(template.New("administration").Parse(`<!doctype html>
<html lang="en"><meta charset="utf-8"><title>UDS identity administration</title><main><h1>UDS identity administration</h1>
<h2>Users</h2><ul>{{range .Users}}<li>{{.Username}} — {{if .Enabled}}enabled{{else}}disabled{{end}}<form method="post" action="/admin/dev/action"><input type="hidden" name="csrf" value="{{$.CSRF}}"><input type="hidden" name="action" value="delete-user"><input type="hidden" name="id" value="{{.ID}}"><button>Delete user</button></form></li>{{end}}</ul>
<form method="post" action="/admin/dev/action"><input type="hidden" name="csrf" value="{{.CSRF}}"><input type="hidden" name="action" value="create-user"><label>Username<input name="username" required></label><label>Email<input type="email" name="email" required></label><label>Password<input type="password" name="password" required></label><button>Create user</button></form>
<h2>Clients</h2><ul>{{range .Clients}}<li>{{.ClientID}}<form method="post" action="/admin/dev/action"><input type="hidden" name="csrf" value="{{$.CSRF}}"><input type="hidden" name="action" value="delete-client"><input type="hidden" name="id" value="{{.ID}}"><button>Delete client</button></form></li>{{end}}</ul>
<form method="post" action="/admin/dev/action"><input type="hidden" name="csrf" value="{{.CSRF}}"><input type="hidden" name="action" value="create-client"><label>Client ID<input name="clientId" required></label><label>Redirect URI<input type="url" name="redirectUri" required></label><button>Create confidential client</button></form>
<form method="post" action="/admin/dev/action"><input type="hidden" name="csrf" value="{{.CSRF}}"><input type="hidden" name="action" value="logout"><button>Sign Out</button></form>
<script type="application/json" id="identity-config">{{.Config}}</script></main></html>`))

func consoleHeaders(writer http.ResponseWriter) {
	writer.Header().Set("Content-Type", "text/html; charset=utf-8")
	writer.Header().Set("Cache-Control", "no-store")
	writer.Header().Set("Content-Security-Policy", "default-src 'none'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'")
}

func (m *Management) consoleFormValid(request *http.Request) bool {
	if request.Method != http.MethodPost {
		return false
	}
	if origin := request.Header.Get("Origin"); origin != "" && origin != "https://"+m.AdminHost {
		return false
	}
	request.Body = http.MaxBytesReader(nil, request.Body, 16384)
	if request.ParseForm() != nil {
		return false
	}
	csrf, err := request.Cookie(csrfCookie)
	return err == nil && len(csrf.Value) == 43 && subtle.ConstantTimeCompare([]byte(csrf.Value), []byte(request.Form.Get("csrf"))) == 1
}

func (m *Management) consoleLogin(writer http.ResponseWriter, request *http.Request) {
	if !m.consoleFormValid(request) {
		http.Error(writer, "Invalid sign in state", 403)
		return
	}
	principal, err := m.Authority.Admin(request.Context(), request.Form.Get("username"), request.Form.Get("password"))
	if err != nil {
		http.Error(writer, "Invalid credentials", 401)
		return
	}
	token, err := randomToken()
	if err != nil {
		http.Error(writer, "Sign in unavailable", 503)
		return
	}
	digest := tokenDigest(token)
	if err := m.Store.Put(request.Context(), "apitoken", digest, apiToken{Digest: digest, Principal: principal, Expires: m.now().Add(5 * time.Minute)}); err != nil {
		http.Error(writer, "Sign in unavailable", 503)
		return
	}
	http.SetCookie(writer, &http.Cookie{Name: adminCookie, Value: token, Path: "/admin", Secure: true, HttpOnly: true, SameSite: http.SameSiteStrictMode, MaxAge: 300})
	http.Redirect(writer, request, "/admin/master/console/", http.StatusSeeOther)
}

func (m *Management) consolePrincipal(request *http.Request) (Principal, string, bool) {
	cookie, err := request.Cookie(adminCookie)
	if err != nil {
		return Principal{}, "", false
	}
	copy := request.Clone(request.Context())
	copy.Header.Set("Authorization", "Bearer "+cookie.Value)
	principal, err := m.authorize(copy)
	return principal, cookie.Value, err == nil && principal.Role == "admin"
}

func (m *Management) consoleAuthenticated(writer http.ResponseWriter, request *http.Request) bool {
	if _, _, ok := m.consolePrincipal(request); !ok {
		return false
	}
	csrf, err := request.Cookie(csrfCookie)
	if err != nil || len(csrf.Value) != 43 {
		return false
	}
	users, err := m.realmUsers(request.Context(), "uds")
	if err != nil {
		http.Error(writer, "Directory unavailable", 503)
		return true
	}
	clients, err := m.Clients.List(request.Context(), "uds")
	if err != nil {
		http.Error(writer, "Clients unavailable", 503)
		return true
	}
	config, _ := json.MarshalIndent(map[string]string{"serverBaseUrl": "https://" + m.AdminHost}, "", "  ")
	consoleHeaders(writer)
	_ = administrationTemplate.Execute(writer, struct {
		CSRF    string
		Config  template.JS
		Users   []User
		Clients []ClientRecord
	}{csrf.Value, template.JS(config), users, clients})
	return true
}

func (m *Management) consoleAction(writer http.ResponseWriter, request *http.Request) {
	if !m.consoleFormValid(request) {
		http.Error(writer, "Invalid action state", 403)
		return
	}
	_, token, ok := m.consolePrincipal(request)
	if !ok {
		http.Error(writer, "Sign in required", 401)
		return
	}
	if request.Form.Get("action") == "logout" {
		if err := m.Store.Delete(request.Context(), "apitoken", tokenDigest(token)); err != nil {
			http.Error(writer, "Sign out unavailable", 503)
			return
		}
		http.SetCookie(writer, &http.Cookie{Name: adminCookie, Path: "/admin", Secure: true, HttpOnly: true, MaxAge: -1})
		http.Redirect(writer, request, "/admin/master/console/", 303)
		return
	}
	method, path, body := http.MethodPost, "/admin/realms/uds/", map[string]any{}
	switch request.Form.Get("action") {
	case "create-user":
		path += "users"
		body = map[string]any{"username": request.Form.Get("username"), "email": request.Form.Get("email"), "enabled": true, "credentials": []map[string]any{{"type": "password", "value": request.Form.Get("password")}}}
	case "create-client":
		path += "clients"
		body = map[string]any{"clientId": request.Form.Get("clientId"), "enabled": true, "publicClient": false, "redirectUris": []string{request.Form.Get("redirectUri")}}
	case "delete-user":
		method, path = http.MethodDelete, path+"users/"+request.Form.Get("id")
	case "delete-client":
		method, path = http.MethodDelete, path+"clients/"+request.Form.Get("id")
	default:
		http.Error(writer, "Unknown action", 400)
		return
	}
	raw, _ := json.Marshal(body)
	apiRequest, err := http.NewRequestWithContext(request.Context(), method, "http://identity.internal"+path, bytes.NewReader(raw))
	if err != nil {
		http.Error(writer, "Invalid action", 400)
		return
	}
	apiRequest.Header.Set("Authorization", "Bearer "+token)
	response := httptest.NewRecorder()
	m.ServeHTTP(response, apiRequest)
	if response.Code >= 400 {
		http.Error(writer, "Administration failed: "+response.Body.String(), response.Code)
		return
	}
	http.Redirect(writer, request, "/admin/master/console/", http.StatusSeeOther)
}

func (m *Management) routeFrontend(writer http.ResponseWriter, request *http.Request) bool {
	path := request.URL.Path
	if request.Host == m.PublicHost && strings.HasPrefix(path, "/admin/") {
		http.Redirect(writer, request, "https://"+m.PublicHost+m.IssuerPath+"/account", http.StatusFound)
		return true
	}
	if request.Host == m.PublicHost && strings.HasPrefix(path, "/realms/master/") && request.Method == http.MethodGet {
		http.Redirect(writer, request, "https://"+m.PublicHost+m.IssuerPath+"/account", http.StatusMovedPermanently)
		return true
	}
	if request.Host != m.AdminHost || m.AdminHost == "" {
		return false
	}
	if path == "/" {
		http.Redirect(writer, request, "/admin/master/console/", http.StatusFound)
		return true
	}
	if path == "/admin/dev/login" {
		m.consoleLogin(writer, request)
		return true
	}
	if path == "/admin/dev/action" {
		m.consoleAction(writer, request)
		return true
	}
	if path != "/admin/master/console/" {
		return false
	}
	if m.consoleAuthenticated(writer, request) {
		return true
	}
	csrf, err := randomToken()
	if err != nil {
		http.Error(writer, "Console unavailable", 503)
		return true
	}
	http.SetCookie(writer, &http.Cookie{Name: csrfCookie, Value: csrf, Path: "/admin", Secure: true, HttpOnly: true, SameSite: http.SameSiteStrictMode, MaxAge: 300})
	config, _ := json.MarshalIndent(map[string]string{"serverBaseUrl": "https://" + m.AdminHost}, "", "  ")
	consoleHeaders(writer)
	_ = consoleTemplate.Execute(writer, struct {
		CSRF   string
		Config template.JS
	}{csrf, template.JS(config)})
	return true
}
