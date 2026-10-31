// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package devidentity

import (
	"net/http"
	"net/http/httptest"
	"net/url"
	"slices"
	"strings"
	"testing"
)

func TestManagedInteractiveDefaultsPreserveRealClaimsAndSessionRefresh(t *testing.T) {
	m, _, _, _ := managementFixture(t)
	client := ClientRecord{Realm: "uds", Data: map[string]any{"id": "interactive", "clientId": "interactive", "publicClient": false, "secret": "real-secret", "standardFlowEnabled": true}}
	if err := m.Clients.Save(t.Context(), client); err != nil {
		t.Fatal(err)
	}
	for _, requested := range []string{"openid", "openid profile", "openid profile email groups offline_access"} {
		actual, err := m.InteractiveScopes(t.Context(), "interactive", requested)
		if err != nil {
			t.Fatal(err)
		}
		for _, scope := range []string{"openid", "profile", "email", "groups", "offline_access"} {
			if strings.Count(" "+actual+" ", " "+scope+" ") != 1 {
				t.Fatal("managed defaults lost or duplicated a supported scope", actual)
			}
		}
		if slices.Contains(strings.Fields(actual), "roles") {
			t.Fatal("unimplemented roles became implicit authority")
		}
	}
	client.Data["defaultClientScopes"] = []string{}
	if err := m.Clients.Save(t.Context(), client); err != nil {
		t.Fatal(err)
	}
	actual, err := m.InteractiveScopes(t.Context(), "interactive", "openid")
	if err != nil || actual != "openid offline_access" {
		t.Fatal("explicit empty default scopes were not preserved", actual, err)
	}
	client.Data["standardFlowEnabled"] = false
	if err := m.Clients.Save(t.Context(), client); err != nil {
		t.Fatal(err)
	}
	if _, err := m.InteractiveScopes(t.Context(), "interactive", "openid"); err == nil {
		t.Fatal("service-account-only client received interactive default scopes")
	}
	for _, unsupported := range []any{[]string{"roles"}, []string{"custom-required-mapper"}, "profile"} {
		if err := validateClient(map[string]any{"clientId": "unsupported", "defaultClientScopes": unsupported}); err == nil {
			t.Fatal("unenforced default client scope accepted")
		}
	}
}

func TestManagedDefaultScopesPreserveStateNonceAndPKCE(t *testing.T) {
	m, _, _, _ := managementFixture(t)
	client := ClientRecord{Realm: "uds", Data: map[string]any{"id": "portal", "clientId": "portal", "publicClient": false, "secret": "real-secret", "redirectUris": []string{"https://portal.example.test/auth"}}}
	if err := m.Clients.Save(t.Context(), client); err != nil {
		t.Fatal(err)
	}
	user := User{ID: "actual-user", Username: "person", Enabled: true}
	if err := m.Directory.Save(t.Context(), user); err != nil {
		t.Fatal(err)
	}
	observed := make(chan url.Values, 1)
	upstream := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		observed <- request.URL.Query()
		writer.WriteHeader(200)
	}))
	defer upstream.Close()
	target, _ := url.Parse(upstream.URL)
	bridge := NewBridge(m.Directory, target, http.DefaultTransport, m.PublicHost, "/realms/uds")
	bridge.Admin, bridge.Sessions, bridge.ManagedDefaults = m, m.Sessions, true
	session, err := bridge.Sessions.CreateIdentity(t.Context(), user)
	if err != nil {
		t.Fatal(err)
	}
	query := url.Values{"client_id": {"portal"}, "scope": {"openid"}, "state": {"unchanged-state"}, "nonce": {"unchanged-nonce"}, "code_challenge": {"unchanged-challenge"}, "code_challenge_method": {"S256"}, "redirect_uri": {"https://portal.example.test/auth"}}
	request := httptest.NewRequest("GET", "https://"+m.PublicHost+"/realms/uds/protocol/openid-connect/auth?"+query.Encode(), nil)
	request.AddCookie(&http.Cookie{Name: SessionCookie, Value: session})
	response := httptest.NewRecorder()
	bridge.ServeHTTP(response, request)
	if response.Code != 200 {
		t.Fatal(response.Code)
	}
	actual := <-observed
	for key := range query {
		if key != "scope" && actual.Get(key) != query.Get(key) {
			t.Fatal("default-scope adaptation changed authorization binding", key)
		}
	}
	if actual.Get("scope") != "openid profile email groups offline_access" {
		t.Fatal("real Dex request did not receive managed interactive defaults", actual.Get("scope"))
	}
}
