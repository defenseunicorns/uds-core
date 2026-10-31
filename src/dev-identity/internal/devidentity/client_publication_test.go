// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package devidentity

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"fmt"
	"net/http/httptest"
	"testing"

	api "github.com/dexidp/dex/api/v2"
	"google.golang.org/grpc"
)

type unavailableDex struct {
	DexClients
	fail bool
}

func (d *unavailableDex) ListClients(ctx context.Context, req *api.ListClientReq, options ...grpc.CallOption) (*api.ListClientResp, error) {
	if d.fail {
		return nil, fmt.Errorf("second issuer API unavailable")
	}
	return d.DexClients.ListClients(ctx, req, options...)
}

func TestClientFieldClearingAndPartialPublicationFailClosedAcrossRestart(t *testing.T) {
	m, kube, public, admin := managementFixture(t)
	failing := &unavailableDex{DexClients: admin}
	m.Clients = NewReplicatedClients(m.Store, public, failing)
	target := ClientRecord{Realm: "uds", Data: map[string]any{"id": "target", "clientId": "target", "name": "Old name", "redirectUris": []string{"https://app.example.test/login"}, "publicClient": false, "secret": "target-secret"}}
	peer := ClientRecord{Realm: "uds", Data: map[string]any{"id": "peer", "clientId": "peer", "publicClient": false, "secret": "peer-secret", "serviceAccountsEnabled": true, "protocolMappers": []map[string]any{{"protocolMapper": "oidc-audience-mapper", "config": map[string]string{"included.client.audience": "target", "access.token.claim": "true"}}}}}
	for _, client := range []ClientRecord{target, peer} {
		if err := m.Clients.Save(t.Context(), client); err != nil {
			t.Fatal(err)
		}
	}
	user := User{ID: "real-user", Username: "person", Enabled: true}
	if err := m.Directory.Save(t.Context(), user); err != nil {
		t.Fatal(err)
	}
	if err := m.UserAllowed(t.Context(), "target", user); err != nil {
		t.Fatal("fully published client unavailable", err)
	}
	failing.fail = true
	target.Data["name"], target.Data["redirectUris"] = "", []string{}
	if err := m.Clients.Save(t.Context(), target); err == nil {
		t.Fatal("partial two-issuer publication reported success")
	}
	oldAdmin, err := admin.GetClient(t.Context(), &api.GetClientReq{Id: "target"})
	if err != nil || len(oldAdmin.Client.RedirectUris) != 1 {
		t.Fatal("failure fixture did not retain stale provider state")
	}
	if err := m.UserAllowed(t.Context(), "target", user); err == nil {
		t.Fatal("partial publication authorized stale user grants")
	}
	assertPrivateGrantFenced(t, m)
	// Reconstruct all bridge-owned adapters; the fence is Kubernetes state.
	store := NewKubeState(kube.CoreV1().Secrets("identity"))
	restarted := NewManagement(NewKubeDirectory(kube.CoreV1().Secrets("identity")), store, NewReplicatedClients(store, public, failing), NewPersistentSessions(store), m.Authority, m.PublicHost, m.AdminHost)
	if err := restarted.UserAllowed(t.Context(), "target", user); err == nil {
		t.Fatal("bridge restart discarded incomplete publication fence")
	}
	assertPrivateGrantFenced(t, restarted)
	failing.fail = false
	if err := restarted.Clients.Restore(t.Context()); err != nil {
		t.Fatal(err)
	}
	if err := restarted.UserAllowed(t.Context(), "target", user); err != nil {
		t.Fatal("repaired client publication remained fenced", err)
	}
	peer.Data["protocolMappers"] = []any{}
	if err := restarted.Clients.Save(t.Context(), peer); err != nil {
		t.Fatal(err)
	}
	for _, dex := range []*testDex{public, admin} {
		actual, err := dex.GetClient(t.Context(), &api.GetClientReq{Id: "target"})
		if err != nil {
			t.Fatal(err)
		}
		if actual.Client.Name != "" || len(actual.Client.RedirectUris) != 0 || len(actual.Client.TrustedPeers) != 0 || actual.Client.Secret != "target-secret" {
			t.Fatal("cleared provider fields retained stale authority", actual.Client.Id)
		}
	}
}

func assertPrivateGrantFenced(t *testing.T, m *Management) {
	t.Helper()
	verified := &tls.ConnectionState{VerifiedChains: [][]*x509.Certificate{{{}}}}
	request := httptest.NewRequest("GET", "https://identity.internal/internal/user-authorization?clientId=target&userId=real-user", nil)
	request.TLS = verified
	response := httptest.NewRecorder()
	m.UserAuthorization(response, request)
	if response.Code < 400 {
		t.Fatal("private token issuance/refresh ignored incomplete publication")
	}
	request = httptest.NewRequest("GET", "https://identity.internal/internal/service-identity?clientId=peer", nil)
	request.TLS = verified
	response = httptest.NewRecorder()
	m.ServiceIdentity(response, request)
	if response.Code < 400 {
		t.Fatal("service-account grant ignored incomplete publication")
	}
}
