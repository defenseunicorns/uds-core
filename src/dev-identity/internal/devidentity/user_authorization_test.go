// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package devidentity

import (
	"testing"
)

func TestClientGroupRevocationImmediatelyChangesIssuerAuthority(t *testing.T) {
	m, _, _, _ := managementFixture(t)
	client := ClientRecord{Realm: "uds", Data: map[string]any{"id": "protected-id", "clientId": "protected", "enabled": true, "standardFlowEnabled": true, "publicClient": false, "secret": "actual-secret", "attributes": map[string]string{"uds.core.groups": "{\"anyOf\":[\"/UDS Core/Admin\"]}"}}}
	if err := m.Clients.Save(t.Context(), client); err != nil {
		t.Fatal(err)
	}
	user := User{ID: "actual-user", Enabled: true, Groups: []string{"/UDS Core/Admin"}}
	if err := m.UserAllowed(t.Context(), "protected", user); err != nil {
		t.Fatal(err)
	}
	user.Groups = []string{"/literal, /UDS Core/Admin"}
	if err := m.UserAllowed(t.Context(), "protected", user); err == nil {
		t.Fatal("literal group name became an administrator group")
	}
	user.Groups = nil
	if err := m.UserAllowed(t.Context(), "protected", user); err == nil {
		t.Fatal("removed group retained client authority")
	}
	user.Groups = []string{"/UDS Core/Admin"}
	user.Enabled = false
	if err := m.UserAllowed(t.Context(), "protected", user); err == nil {
		t.Fatal("disabled user retained client authority")
	}
}

func TestUnsupportedAuthenticationRequirementIsRejected(t *testing.T) {
	m, _, _, _ := managementFixture(t)
	token, _ := adminToken(t, m, "admin", "real-admin-password")
	path := "/admin/realms/uds/authentication/flows/Authentication/executions"
	response := managementRequest(m, "GET", path, token, nil)
	if response.Code != 200 {
		t.Fatal(response.Code)
	}
	response = managementRequest(m, "PUT", path, token, map[string]string{"id": "uds-dev-conditional-otp", "requirement": "DISABLED"})
	if response.Code != 204 {
		t.Fatal(response.Code)
	}
	response = managementRequest(m, "PUT", path, token, map[string]string{"id": "uds-dev-conditional-otp", "requirement": "REQUIRED"})
	if response.Code < 400 {
		t.Fatal("unenforced authentication requirement accepted")
	}
}

func TestManagementRejectsUnsupportedProtocolsAndRequiredFlows(t *testing.T) {
	m, _, _, _ := managementFixture(t)
	token, _ := adminToken(t, m, "admin", "real-admin-password")
	for _, body := range []map[string]any{
		{"clientId": "saml-client", "protocol": "saml", "enabled": true},
		{"clientId": "unsigned-mapping", "protocol": "openid-connect", "protocolMappers": []map[string]any{{"protocolMapper": "oidc-hardcoded-role-mapper"}}},
		{"clientId": "unmapped-jwt", "protocol": "openid-connect", "clientAuthenticatorType": "client-jwt"},
	} {
		if response := managementRequest(m, "POST", "/admin/realms/uds/clients", token, body); response.Code < 400 {
			t.Fatal("unenforced protocol configuration accepted", body)
		}
	}
	response := managementRequest(m, "POST", "/admin/realms/uds/users", token, map[string]any{"username": "requires-otp", "enabled": true, "requiredActions": []string{"CONFIGURE_TOTP"}})
	if response.Code < 400 {
		t.Fatal("unenforced required user action accepted")
	}
}
