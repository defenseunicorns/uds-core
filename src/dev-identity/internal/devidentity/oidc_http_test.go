// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package devidentity

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
)

func TestTokenOriginsFollowCurrentClientPolicy(t *testing.T) {
	m, _, _, _ := managementFixture(t)
	client := ClientRecord{Realm: "uds", Data: map[string]any{"id": "grafana", "clientId": "grafana", "secret": "secret", "webOrigins": []string{"https://grafana.example.test"}, "redirectUris": []string{"https://grafana.example.test/callback"}}}
	if err := m.Clients.Save(t.Context(), client); err != nil {
		t.Fatal(err)
	}
	calls := 0
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		w.Header().Set("Access-Control-Allow-Origin", "*")
		http.Error(w, "invalid code", 400)
	}))
	defer upstream.Close()
	target, _ := url.Parse(upstream.URL)
	for _, host := range []string{m.PublicHost, m.AdminHost} {
		bridge := NewBridge(m.Directory, target, http.DefaultTransport, host, m.IssuerPath)
		bridge.Admin = m
		for _, path := range []string{"/token", "/protocol/openid-connect/token"} {
			for _, origin := range []string{"https://grafana.example.test", "https://unapproved.example", "https://grafana.example.test.attacker.invalid", "null"} {
				request := httptest.NewRequest("POST", "https://"+host+m.IssuerPath+path, strings.NewReader("grant_type=authorization_code&code=invalid"))
				request.SetBasicAuth("grafana", "secret")
				request.Header.Set("Content-Type", "application/x-www-form-urlencoded")
				request.Header.Set("Origin", origin)
				response := httptest.NewRecorder()
				before := calls
				bridge.ServeHTTP(response, request)
				if origin == "https://grafana.example.test" {
					if response.Code != 400 || calls != before+1 || response.Header().Get("Access-Control-Allow-Origin") != origin || len(response.Header().Values("Access-Control-Allow-Origin")) != 1 || response.Header().Get("Access-Control-Allow-Credentials") != "true" {
						t.Fatalf("approved CORS lost: %d %v", response.Code, response.Header())
					}
				} else if response.Code != 403 || calls != before || response.Header().Get("Access-Control-Allow-Origin") != "" {
					t.Fatalf("unapproved origin reached Dex: %d %v", response.Code, response.Header())
				}
			}
		}
	}
	client.Data["webOrigins"] = []string{}
	if err := m.Clients.Save(t.Context(), client); err != nil {
		t.Fatal(err)
	}
	request := tokenRequest("grafana", "authorization_code", nil)
	request.Header.Set("Origin", "https://grafana.example.test")
	response := httptest.NewRecorder()
	if !m.ServeHTTP(response, request) || response.Code != 403 {
		t.Fatal("cleared origin remained authorized", response.Code)
	}
}

func TestUnlistedRedirectRejectedBeforeCredentials(t *testing.T) {
	m, _, _, _ := managementFixture(t)
	client := ClientRecord{Realm: "uds", Data: map[string]any{"id": "grafana", "clientId": "grafana", "secret": "secret", "redirectUris": []string{"https://grafana.example.test/callback"}}}
	if err := m.Clients.Save(t.Context(), client); err != nil {
		t.Fatal(err)
	}
	target, _ := url.Parse("https://unused.invalid")
	bridge := NewBridge(m.Directory, target, http.DefaultTransport, m.PublicHost, m.IssuerPath)
	bridge.Admin = m
	for _, path := range []string{"/auth", "/protocol/openid-connect/auth"} {
		request := httptest.NewRequest("GET", "https://"+m.PublicHost+m.IssuerPath+path+"?client_id=grafana&response_type=code&redirect_uri=https%3A%2F%2Fgrafana.example.test%2Funlisted", nil)
		response := httptest.NewRecorder()
		bridge.ServeHTTP(response, request)
		if response.Code != 400 || len(response.Result().Cookies()) != 0 || response.Header().Get("Location") != "" {
			t.Fatal("unlisted redirect reached login", response.Code)
		}
	}
}

func TestDiscoveryAliasesAndCORSKeepConfiguredIssuer(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{"issuer": "https://sso.example.test/realms/uds", "token_endpoint": "https://sso.example.test/realms/uds/token"})
	}))
	defer upstream.Close()
	target, _ := url.Parse(upstream.URL)
	bridge := NewBridge(testDirectory(t), target, http.DefaultTransport, "sso.example.test", "/realms/uds")
	request := httptest.NewRequest("GET", "https://sso.example.test/realms/uds/.well-known/openid-configuration", nil)
	request.Header.Set("Origin", "https://client.example.test")
	request.Header.Set("X-Forwarded-Host", "attacker.invalid")
	response := httptest.NewRecorder()
	bridge.ServeHTTP(response, request)
	var discovery map[string]any
	if err := json.Unmarshal(response.Body.Bytes(), &discovery); err != nil {
		t.Fatal(err)
	}
	if response.Code != 200 || discovery["token_endpoint"] != "https://sso.example.test/realms/uds/protocol/openid-connect/token" || discovery["issuer"] != "https://sso.example.test/realms/uds" || response.Header().Get("Access-Control-Allow-Origin") != "https://client.example.test" || !strings.Contains(response.Header().Get("Vary"), "Origin") {
		t.Fatal("discovery changed authority or omitted CORS", response.Code, discovery, response.Header())
	}
	request = httptest.NewRequest("OPTIONS", "https://sso.example.test/realms/uds/protocol/openid-connect/token", nil)
	request.Header.Set("Origin", "https://client.example.test")
	response = httptest.NewRecorder()
	bridge.ServeHTTP(response, request)
	if response.Code != 204 || response.Header().Get("Access-Control-Allow-Origin") != "https://client.example.test" || response.Header().Get("Vary") != "Origin" {
		t.Fatal("preflight omitted origin cache variation", response.Code, response.Header())
	}
}
