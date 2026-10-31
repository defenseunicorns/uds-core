// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package devidentity

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"net/http/httptest"
	"testing"
)

type grantReadState struct {
	StateStore
	gets, lists int
}

func (s *grantReadState) Get(ctx context.Context, kind, key string, value any) error {
	s.gets++
	return s.StateStore.Get(ctx, kind, key, value)
}
func (s *grantReadState) List(ctx context.Context, kind string) ([][]byte, error) {
	s.lists++
	return s.StateStore.List(ctx, kind)
}
func TestOrdinarySigningChecksUserAndGenerationFromOnePublicationSnapshot(t *testing.T) {
	m, _, _, _ := managementFixture(t)
	if err := m.Clients.Save(t.Context(), ClientRecord{Realm: "uds", Data: map[string]any{"id": "app", "clientId": "app", "secret": "secret", "publicClient": false}}); err != nil {
		t.Fatal(err)
	}
	user := User{ID: "real-user", Username: "user", Enabled: true}
	if err := m.Directory.Save(t.Context(), user); err != nil {
		t.Fatal(err)
	}
	store := &grantReadState{StateStore: m.Clients.store}
	m.Clients.store = store
	request := httptest.NewRequest("GET", "https://identity.internal/internal/user-authorization?clientId=app&userId=real-user", nil)
	request.TLS = &tls.ConnectionState{VerifiedChains: [][]*x509.Certificate{{{}}}}
	response := httptest.NewRecorder()
	m.UserAuthorization(response, request)
	if response.Code != 204 {
		t.Fatal(response.Code)
	}
	if store.lists != 1 || store.gets != 3 {
		t.Fatal("ordinary signing repeated authority snapshot requests", store.lists, store.gets)
	}
}
func TestSingleSnapshotGrantCheckStillRejectsMissingAndReplacedUID(t *testing.T) {
	m, source, _, _ := pairedManagement(t)
	user := User{ID: "actual-user", Username: "actual", Enabled: true}
	original := currentGeneration(t, m, "ark-cli")
	if err := m.userAllowedGrant(t.Context(), "ark-cli", user, &original); err != nil {
		t.Fatal(err)
	}
	missing := ""
	if err := m.userAllowedGrant(t.Context(), "ark-cli", user, &missing); err == nil {
		t.Fatal("missing grant binding accepted")
	}
	source.pkg.UID = "changed-uid"
	if err := m.userAllowedGrant(t.Context(), "ark-cli", user, &original); err == nil {
		t.Fatal("older UID grant accepted")
	}
}
