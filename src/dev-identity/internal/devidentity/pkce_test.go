// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package devidentity

import (
	"crypto/sha256"
	"encoding/base64"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
)

func tokenRequest(client, grant string, extra url.Values) *http.Request {
	form := url.Values{"client_id": {client}, "grant_type": {grant}}
	for key, values := range extra {
		form[key] = values
	}
	request := httptest.NewRequest("POST", "https://sso.example.test/realms/uds/protocol/openid-connect/token", strings.NewReader(form.Encode()))
	request.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	_ = request.ParseForm()
	return request
}
func authPKCERequest(extra url.Values) *http.Request {
	query := url.Values{"client_id": {"ark-cli"}, "response_type": {"code"}, "scope": {"openid"}, "redirect_uri": {"http://localhost:8000"}}
	for key, values := range extra {
		query[key] = values
	}
	return httptest.NewRequest("GET", "https://sso.example.test/realms/uds/protocol/openid-connect/auth?"+query.Encode(), nil)
}
func TestMandatoryS256AuthorizationAndTokenPolicy(t *testing.T) {
	m, _, _, _ := pairedManagement(t)
	verifier := strings.Repeat("v", 43)
	hash := sha256.Sum256([]byte(verifier))
	challenge := base64.RawURLEncoding.EncodeToString(hash[:])
	valid := url.Values{"code_challenge": {challenge}, "code_challenge_method": {"S256"}}
	if err := m.checkPKCEAuth(t.Context(), authPKCERequest(valid)); err != nil {
		t.Fatal(err)
	}
	for name, query := range map[string]url.Values{
		"missing": {}, "plain": {"code_challenge": {verifier}, "code_challenge_method": {"plain"}}, "method-omitted": {"code_challenge": {challenge}}, "short": {"code_challenge": {"short"}, "code_challenge_method": {"S256"}}, "duplicate": {"code_challenge": {challenge}, "code_challenge_method": {"S256", "plain"}}, "implicit": {"code_challenge": {challenge}, "code_challenge_method": {"S256"}, "response_type": {"id_token"}},
	} {
		t.Run(name, func(t *testing.T) {
			if err := m.checkPKCEAuth(t.Context(), authPKCERequest(query)); err == nil {
				t.Fatal("authorization bypassed required S256")
			}
		})
	}
	for _, value := range []url.Values{nil, {"code_verifier": {"short"}}, {"code_verifier": {verifier, verifier}}, {"code_verifier": {strings.Repeat("!", 43)}}} {
		if err := m.checkPKCEToken(t.Context(), tokenRequest("ark-cli", "authorization_code", value)); err == nil {
			t.Fatal("malformed code verifier accepted")
		}
	}
	if err := m.checkPKCEToken(t.Context(), tokenRequest("ark-cli", "authorization_code", url.Values{"code_verifier": {verifier}})); err != nil {
		t.Fatal(err)
	}
	if err := m.checkPKCEToken(t.Context(), tokenRequest("ark-cli", "refresh_token", nil)); err != nil {
		t.Fatal("refresh incorrectly required original verifier", err)
	}
}
func TestPublicWithoutDeclaredS256FailsAtBothEndpoints(t *testing.T) {
	m, _, _, _ := managementFixture(t)
	if err := m.Clients.Save(t.Context(), ClientRecord{Realm: "uds", Data: map[string]any{"id": "public", "clientId": "public", "publicClient": true}}); err != nil {
		t.Fatal(err)
	}
	request := authPKCERequest(url.Values{"client_id": {"public"}, "code_challenge": {strings.Repeat("a", 43)}, "code_challenge_method": {"S256"}})
	if err := m.checkPKCEAuth(t.Context(), request); err == nil {
		t.Fatal("undeclared public S256 policy granted auth")
	}
	if err := m.checkPKCEToken(t.Context(), tokenRequest("public", "authorization_code", url.Values{"code_verifier": {strings.Repeat("v", 43)}})); err == nil {
		t.Fatal("undeclared public policy granted token")
	}
}
func TestS256CheckHappensBeforeLoginOrProxy(t *testing.T) {
	m, _, _, _ := pairedManagement(t)
	proxyCalls := 0
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { proxyCalls++; w.WriteHeader(200) }))
	defer upstream.Close()
	target, _ := url.Parse(upstream.URL)
	bridge := NewBridge(m.Directory, target, http.DefaultTransport, m.PublicHost, "/realms/uds")
	bridge.Admin = m
	bridge.ManagedDefaults = true
	writer := httptest.NewRecorder()
	bridge.ServeHTTP(writer, authPKCERequest(nil))
	if writer.Code != 400 || proxyCalls != 0 || len(writer.Result().Cookies()) != 0 {
		t.Fatal("bad PKCE reached login or Dex", writer.Code, proxyCalls)
	}
	request := tokenRequest("ark-cli", "authorization_code", nil)
	writer = httptest.NewRecorder()
	bridge.ServeHTTP(writer, request)
	if writer.Code != 400 || proxyCalls != 0 {
		t.Fatal("missing verifier reached Dex", writer.Code, proxyCalls)
	}
}

func TestRawDexTokenAliasCannotBypassS256Policy(t *testing.T) {
	m, _, _, _ := pairedManagement(t)
	request := tokenRequest("ark-cli", "authorization_code", nil)
	request.URL.Path = "/realms/uds/token"
	writer := httptest.NewRecorder()
	if !m.ServeHTTP(writer, request) || writer.Code != 400 {
		t.Fatal("raw Dex token alias bypassed native policy", writer.Code)
	}
}
