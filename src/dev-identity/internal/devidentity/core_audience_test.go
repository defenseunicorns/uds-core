// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package devidentity

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http/httptest"
	"net/url"
	"slices"
	"strings"
	"testing"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/utils/ptr"
)

type packageFixture struct {
	pkg *CorePackage
	err error
}

func (f *packageFixture) GetCorePackage(ctx context.Context, namespace, name string) (*CorePackage, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	if f.err != nil {
		return nil, f.err
	}
	if f.pkg == nil || f.pkg.Namespace != namespace || f.pkg.Name != name {
		return nil, fmt.Errorf("package not found")
	}
	return f.pkg.DeepCopy(), nil
}
func audiencePackage() *CorePackage {
	return &CorePackage{ObjectMeta: metav1.ObjectMeta{Namespace: "ark", Name: "ark", UID: types.UID("real-package-uid")}, Spec: CorePackageSpec{Sso: []Sso{
		{ClientID: "ark-server", Name: "Ark", EnableAuthserviceSelector: map[string]string{"app": "ark"}, StandardFlowEnabled: ptr.To(true), PublicClient: ptr.To(false), FullScopeAllowed: ptr.To(false), RedirectUris: []string{"https://ark.example.test/login"}},
		{ClientID: "ark-cli", Name: "Ark CLI", StandardFlowEnabled: ptr.To(true), PublicClient: ptr.To(true), FullScopeAllowed: ptr.To(false), RedirectUris: []string{"http://localhost:8000"}, Attributes: map[string]string{"pkce.code.challenge.method": "S256"}, ProtocolMappers: []ProtocolMapper{{Name: "ark-audience", Protocol: Protocol("openid-connect"), ProtocolMapper: "oidc-audience-mapper", Config: map[string]string{"included.client.audience": "ark-server", "id.token.claim": "true", "access.token.claim": "false"}}}},
	}}}
}
func ownedClient(pkg *CorePackage, index int) ClientRecord {
	spec := pkg.Spec.Sso[index]
	data := CanonicalClientProjection(spec)
	data["id"] = spec.ClientID
	if !ptr.Deref(spec.PublicClient, false) {
		data["secret"] = "generated-real-secret"
	}
	attrs := data["attributes"].(map[string]any)
	for key, value := range map[string]string{"namespace": pkg.Namespace, "name": pkg.Name, "uid": string(pkg.UID), "spec-sha256": CoreClientSpecDigest(spec)} {
		attrs[CoreOwnerPrefix+key] = value
	}
	_ = validateClient(data)
	return ClientRecord{Realm: "uds", Data: data}
}
func pairedManagement(t *testing.T) (*Management, *packageFixture, *testDex, *testDex) {
	t.Helper()
	m, _, public, admin := managementFixture(t)
	source := &packageFixture{pkg: audiencePackage()}
	m.Clients.Packages = source
	m.Clients.CoreAudiencePairsEnabled = true
	for index := range source.pkg.Spec.Sso {
		client := ownedClient(source.pkg, index)
		if err := m.authenticateCoreOwner(t.Context(), Principal{Role: "operator", Subject: "uds-operator"}, &client); err != nil {
			t.Fatal(err)
		}
		if err := m.Clients.Save(t.Context(), client); err != nil {
			t.Fatal(err)
		}
	}
	return m, source, public, admin
}
func TestAuthoritativePublicAudiencePair(t *testing.T) {
	m, _, public, admin := pairedManagement(t)
	for _, dex := range []*testDex{public, admin} {
		if !slices.Equal(dex.clients["ark-server"].TrustedPeers, []string{"ark-cli"}) {
			t.Fatal("actual Dex server does not trust only its declared CLI")
		}
	}
	actual, err := m.InteractiveScopes(t.Context(), "ark-cli", "openid groups")
	if err != nil || strings.Count(actual, "audience:server:client_id:ark-server") != 1 {
		t.Fatal(actual, err)
	}
	if _, err := m.InteractiveScopes(t.Context(), "ark-server", "openid"); err != nil {
		t.Fatal(err)
	}
}
func TestCoreAudienceReservedProvenanceCannotBeForged(t *testing.T) {
	for _, role := range []string{"admin", "fleet", "", "user"} {
		t.Run(role, func(t *testing.T) {
			m, _, _, _ := managementFixture(t)
			m.Clients.Packages = &packageFixture{pkg: audiencePackage()}
			m.Clients.CoreAudiencePairsEnabled = true
			client := ownedClient(audiencePackage(), 1)
			if err := m.authenticateCoreOwner(t.Context(), Principal{Role: role, Subject: "same-user-controlled-subject"}, &client); err == nil {
				t.Fatal("reserved attrs created operator authority")
			}
		})
	}
	m, _, _, _ := managementFixture(t)
	client := ownedClient(audiencePackage(), 1)
	delete(client.Data, "attributes")
	if err := m.authenticateCoreOwner(t.Context(), Principal{Role: "operator", Subject: "uds-operator"}, &client); err == nil {
		t.Fatal("unprovenanced public audience accepted")
	}
}
func TestCoreAudienceRejectsChangedAndUnsupportedAuthority(t *testing.T) {
	changes := map[string]func(*packageFixture, *ClientRecord){
		"deleted":           func(f *packageFixture, c *ClientRecord) { f.pkg = nil },
		"replaced-uid":      func(f *packageFixture, c *ClientRecord) { f.pkg.UID = "replacement" },
		"terminating":       func(f *packageFixture, c *ClientRecord) { now := metav1.Now(); f.pkg.DeletionTimestamp = &now },
		"foreign-namespace": func(f *packageFixture, c *ClientRecord) { f.pkg.Namespace = "foreign" },
		"changed-spec": func(f *packageFixture, c *ClientRecord) {
			f.pkg.Spec.Sso[1].RedirectUris = []string{"https://attacker.example/callback"}
		},
		"wrong-target": func(f *packageFixture, c *ClientRecord) {
			f.pkg.Spec.Sso[1].ProtocolMappers[0].Config["included.client.audience"] = "other-server"
			*c = ownedClient(f.pkg, 1)
		},
		"public-target":          func(f *packageFixture, c *ClientRecord) { f.pkg.Spec.Sso[0].PublicClient = ptr.To(true) },
		"service-account-target": func(f *packageFixture, c *ClientRecord) { f.pkg.Spec.Sso[0].ServiceAccountsEnabled = ptr.To(true) },
		"no-authservice-target":  func(f *packageFixture, c *ClientRecord) { f.pkg.Spec.Sso[0].EnableAuthserviceSelector = nil },
		"public-secret": func(f *packageFixture, c *ClientRecord) {
			f.pkg.Spec.Sso[1].Secret = ptr.To("forbidden")
			*c = ownedClient(f.pkg, 1)
		},
		"service-account-peer": func(f *packageFixture, c *ClientRecord) {
			f.pkg.Spec.Sso[1].ServiceAccountsEnabled = ptr.To(true)
			*c = ownedClient(f.pkg, 1)
		},
		"plain-peer": func(f *packageFixture, c *ClientRecord) {
			f.pkg.Spec.Sso[1].Attributes["pkce.code.challenge.method"] = "plain"
			*c = ownedClient(f.pkg, 1)
		},
		"undeclared-direct-grant": func(f *packageFixture, c *ClientRecord) { c.Data["directAccessGrantsEnabled"] = true },
		"tampered-redirect": func(f *packageFixture, c *ClientRecord) {
			c.Data["redirectUris"] = []string{"https://attacker.example/callback"}
		},
		"missing-live-reader": func(f *packageFixture, c *ClientRecord) { f.err = fmt.Errorf("forbidden live get") },
	}
	for name, change := range changes {
		t.Run(name, func(t *testing.T) {
			m, _, _, _ := managementFixture(t)
			f := &packageFixture{pkg: audiencePackage()}
			m.Clients.Packages = f
			m.Clients.CoreAudiencePairsEnabled = true
			client := ownedClient(f.pkg, 1)
			change(f, &client)
			if err := m.authenticateCoreOwner(t.Context(), Principal{Role: "operator", Subject: "uds-operator"}, &client); err == nil {
				t.Fatal("invalid authoritative pairing accepted")
			}
		})
	}
}
func operatorAPIToken(t *testing.T, m *Management) string {
	t.Helper()
	form := url.Values{"client_id": {"uds-operator"}, "client_secret": {"real-operator-secret"}, "grant_type": {"client_credentials"}}
	req := httptest.NewRequest("POST", "http://identity.internal/realms/uds/protocol/openid-connect/token", strings.NewReader(form.Encode()))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	response := httptest.NewRecorder()
	m.ServeHTTP(response, req)
	var value struct {
		AccessToken string `json:"access_token"`
	}
	_ = json.Unmarshal(response.Body.Bytes(), &value)
	if response.Code != 200 || value.AccessToken == "" {
		t.Fatal(response.Code)
	}
	return value.AccessToken
}
func TestCoreAudienceManagementCollectionRequiresRealOperatorToken(t *testing.T) {
	m, _, _, _ := managementFixture(t)
	f := &packageFixture{pkg: audiencePackage()}
	m.Clients.Packages = f
	m.Clients.CoreAudiencePairsEnabled = true
	adm, code := adminToken(t, m, "admin", "real-admin-password")
	if code != 200 {
		t.Fatal(code)
	}
	if response := managementRequest(m, "POST", "/admin/realms/uds/clients", adm, ownedClient(f.pkg, 1).Data); response.Code != 403 {
		t.Fatal("admin forged operator-owned peer", response.Code)
	}
	operator := operatorAPIToken(t, m)
	for index := range f.pkg.Spec.Sso {
		if response := managementRequest(m, "POST", "/admin/realms/uds/clients", operator, ownedClient(f.pkg, index).Data); response.Code != 201 {
			t.Fatal(response.Code, response.Body.String())
		}
	}
	f.pkg.UID = "replacement"
	if _, err := m.InteractiveScopes(t.Context(), "ark-cli", "openid"); err == nil {
		t.Fatal("Package replacement retained token authority")
	}
	if err := m.checkPKCEToken(t.Context(), tokenRequest("ark-cli", "refresh_token", nil)); err == nil {
		t.Fatal("refresh retained authority after Package replacement")
	}
}

func TestCoreAudienceRevocationFencesBothIssuersWithoutUnrelatedOutage(t *testing.T) {
	m, source, public, admin := pairedManagement(t)
	unrelated := ClientRecord{Realm: "uds", Data: map[string]any{"id": "other", "clientId": "other", "secret": "other-secret", "publicClient": false}}
	if err := m.Clients.Save(t.Context(), unrelated); err != nil {
		t.Fatal(err)
	}
	failing := &unavailableDex{DexClients: admin, fail: true}
	m.Clients.dex = []DexClients{public, failing}
	source.pkg.Spec.Sso[1].ProtocolMappers = nil
	changed := ownedClient(source.pkg, 1)
	if err := m.authenticateCoreOwner(t.Context(), Principal{Role: "operator", Subject: "uds-operator"}, &changed); err != nil {
		t.Fatal(err)
	}
	if err := m.Clients.Save(t.Context(), changed); err == nil {
		t.Fatal("partial two-issuer removal reported success")
	}
	if len(public.clients["ark-server"].TrustedPeers) != 0 || !slices.Equal(admin.clients["ark-server"].TrustedPeers, []string{"ark-cli"}) {
		t.Fatal("partial failure fixture did not expose actual stale peer grant")
	}
	for _, id := range []string{"ark-cli", "ark-server"} {
		if _, err := m.InteractiveScopes(t.Context(), id, "openid"); err == nil {
			t.Fatal("partial audience publication retained affected client authority", id)
		}
	}
	if _, err := m.InteractiveScopes(t.Context(), "other", "openid"); err != nil {
		t.Fatal("unrelated client suffered publication outage", err)
	}
	replacement := NewReplicatedClients(m.Store, public, failing)
	replacement.Packages = source
	replacement.CoreAudiencePairsEnabled = true
	m.Clients = replacement
	if err := m.checkPKCEToken(t.Context(), tokenRequest("ark-cli", "refresh_token", nil)); err == nil {
		t.Fatal("restart discarded audience revocation fence")
	}
	failing.fail = false
	if err := replacement.Restore(t.Context()); err != nil {
		t.Fatal(err)
	}
	for _, dex := range []*testDex{public, admin} {
		if len(dex.clients["ark-server"].TrustedPeers) != 0 {
			t.Fatal("actual API retained removed CLI trust")
		}
	}
}

func TestCoreAudienceRestoreRevokesDeletedPackageWithoutGlobalFence(t *testing.T) {
	m, source, public, admin := pairedManagement(t)
	unrelated := ClientRecord{Realm: "uds", Data: map[string]any{"id": "other", "clientId": "other", "secret": "other-secret", "publicClient": false}}
	if err := m.Clients.Save(t.Context(), unrelated); err != nil {
		t.Fatal(err)
	}
	source.pkg = nil
	replacement := NewReplicatedClients(m.Store, public, admin)
	replacement.Packages = source
	replacement.CoreAudiencePairsEnabled = true
	m.Clients = replacement
	if err := replacement.Restore(t.Context()); err != nil {
		t.Fatal("stale provenance prevented safe restoration", err)
	}
	for _, dex := range []*testDex{public, admin} {
		if dex.clients["ark-cli"] != nil || dex.clients["ark-server"] != nil {
			t.Fatal("restart restored stale Package grant")
		}
		if dex.clients["other"] == nil {
			t.Fatal("unrelated client revoked")
		}
	}
	if _, err := m.InteractiveScopes(t.Context(), "other", "openid"); err != nil {
		t.Fatal(err)
	}
	if err := m.checkPKCEToken(t.Context(), tokenRequest("ark-cli", "refresh_token", nil)); err == nil {
		t.Fatal("deleted Package still has refresh authority")
	}
	source.pkg = audiencePackage()
	source.pkg.UID = "replacement-package"
	if err := replacement.Restore(t.Context()); err != nil {
		t.Fatal(err)
	}
	if public.clients["ark-cli"] != nil {
		t.Fatal("same-name Package replacement restored original UID grant")
	}
}
