// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package devidentity

import (
	"net/url"
	"strings"
	"testing"
)

func currentGeneration(t *testing.T, m *Management, id string) string {
	t.Helper()
	client, records, err := m.Clients.PublishedClient(t.Context(), "uds", id)
	if err != nil {
		t.Fatal(err)
	}
	generation, err := clientGeneration(client, records)
	if err != nil {
		t.Fatal(err)
	}
	return generation
}
func TestStoredGrantCannotCrossPackageUIDReplacementWithSameClientIDs(t *testing.T) {
	m, source, _, _ := pairedManagement(t)
	original := currentGeneration(t, m, "ark-cli")
	if err := m.userGrantGeneration(t.Context(), "ark-cli", original); err != nil {
		t.Fatal(err)
	}
	source.pkg.UID = "new-package-same-name-clientIDs"
	for index := range source.pkg.Spec.Sso {
		record := ownedClient(source.pkg, index)
		if err := m.authenticateCoreOwner(t.Context(), Principal{Role: "operator", Subject: "uds-operator"}, &record); err != nil {
			t.Fatal(err)
		}
		if err := m.Clients.Save(t.Context(), record); err != nil {
			t.Fatal(err)
		}
	}
	successor := currentGeneration(t, m, "ark-cli")
	if successor == original {
		t.Fatal("Package UID was not part of original grant binding")
	}
	for _, old := range []string{original, ""} {
		if err := m.userGrantGeneration(t.Context(), "ark-cli", old); err == nil {
			t.Fatal("old or unbound grant adopted replacement client")
		}
	}
	if err := m.userGrantGeneration(t.Context(), "ark-cli", successor); err != nil {
		t.Fatal("fresh replacement grant denied", err)
	}
}
func TestGrantGenerationBindsExactTargetSpecificationAndRejectsReservedInput(t *testing.T) {
	m, source, _, _ := pairedManagement(t)
	old := currentGeneration(t, m, "ark-cli")
	source.pkg.Spec.Sso[0].RedirectUris = []string{"https://ark.example.test/new-login"}
	server := ownedClient(source.pkg, 0)
	if err := m.authenticateCoreOwner(t.Context(), Principal{Role: "operator", Subject: "uds-operator"}, &server); err != nil {
		t.Fatal(err)
	}
	if err := m.Clients.Save(t.Context(), server); err != nil {
		t.Fatal(err)
	}
	newer := currentGeneration(t, m, "ark-cli")
	if old == newer {
		t.Fatal("target revision did not change pair binding")
	}
	if err := m.userGrantGeneration(t.Context(), "ark-cli", old); err == nil {
		t.Fatal("older client-pair grant survived changed target")
	}
	requested := "openid " + clientGenerationScopePrefix + newer
	if _, err := m.InteractiveScopes(t.Context(), "ark-cli", requested); err == nil {
		t.Fatal("caller chose grant generation")
	}
	auth := authPKCERequest(url.Values{"scope": {requested}, "code_challenge": {strings.Repeat("a", 43)}, "code_challenge_method": {"S256"}})
	if err := m.checkPKCEAuth(t.Context(), auth); err == nil {
		t.Fatal("reserved generation reached login")
	}
	if err := m.checkPKCEToken(t.Context(), tokenRequest("ark-cli", "refresh_token", url.Values{"scope": {requested}})); err == nil {
		t.Fatal("refresh caller chose replacement generation")
	}
	scope, err := m.InteractiveScopes(t.Context(), "ark-cli", "openid")
	if err != nil {
		t.Fatal(err)
	}
	if strings.Count(scope, clientGenerationScopePrefix+newer) != 1 {
		t.Fatal("native binding not added exactly once")
	}
}
func TestOrdinaryGrantHasNoGenerationScope(t *testing.T) {
	m, _, _, _ := managementFixture(t)
	client := ClientRecord{Realm: "uds", Data: map[string]any{"id": "ordinary", "clientId": "ordinary", "publicClient": false, "secret": "real-secret"}}
	if err := m.Clients.Save(t.Context(), client); err != nil {
		t.Fatal(err)
	}
	scope, err := m.InteractiveScopes(t.Context(), "ordinary", "openid")
	if err != nil {
		t.Fatal(err)
	}
	if scope != "openid profile email groups offline_access" {
		t.Fatal("ordinary grant scope bytes changed", scope)
	}
	if err := m.userGrantGeneration(t.Context(), "ordinary", ""); err != nil {
		t.Fatal(err)
	}
	if err := m.userGrantGeneration(t.Context(), "ordinary", strings.Repeat("a", 64)); err == nil {
		t.Fatal("ordinary client adopted revoked paired grant")
	}
}
