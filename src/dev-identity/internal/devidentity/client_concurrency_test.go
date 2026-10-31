// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package devidentity

import (
	"context"
	"fmt"
	"sync"
	"sync/atomic"
	"testing"

	api "github.com/dexidp/dex/api/v2"
	"google.golang.org/grpc"
)

type countedDex struct {
	DexClients
	calls atomic.Int64
}

func (d *countedDex) ListClients(ctx context.Context, req *api.ListClientReq, options ...grpc.CallOption) (*api.ListClientResp, error) {
	d.calls.Add(1)
	return d.DexClients.ListClients(ctx, req, options...)
}
func (d *countedDex) GetClient(ctx context.Context, req *api.GetClientReq, options ...grpc.CallOption) (*api.GetClientResp, error) {
	d.calls.Add(1)
	return d.DexClients.GetClient(ctx, req, options...)
}
func (d *countedDex) CreateClient(ctx context.Context, req *api.CreateClientReq, options ...grpc.CallOption) (*api.CreateClientResp, error) {
	d.calls.Add(1)
	return d.DexClients.CreateClient(ctx, req, options...)
}
func (d *countedDex) UpdateClient(ctx context.Context, req *api.UpdateClientReq, options ...grpc.CallOption) (*api.UpdateClientResp, error) {
	d.calls.Add(1)
	return d.DexClients.UpdateClient(ctx, req, options...)
}
func (d *countedDex) DeleteClient(ctx context.Context, req *api.DeleteClientReq, options ...grpc.CallOption) (*api.DeleteClientResp, error) {
	d.calls.Add(1)
	return d.DexClients.DeleteClient(ctx, req, options...)
}

func TestUnchangedManagementPUTWritesNothingAndCallsNeitherDex(t *testing.T) {
	m, _, public, admin := managementFixture(t)
	store := &countedState{StateStore: NewMemoryState()}
	one, two := &countedDex{DexClients: public}, &countedDex{DexClients: admin}
	m.Clients = NewReplicatedClients(store, one, two)
	token, _ := adminToken(t, m, "admin", "real-admin-password")
	created := managementRequest(m, "POST", "/admin/realms/uds/clients", token, map[string]any{"clientId": "same", "redirectUris": []string{"https://app.example.test/auth"}, "defaultClientScopes": []string{}})
	if created.Code != 201 {
		t.Fatal(created.Code)
	}
	record, err := m.Clients.Find(t.Context(), "uds", "same")
	if err != nil {
		t.Fatal(err)
	}
	store.writes = 0
	one.calls.Store(0)
	two.calls.Store(0)
	for index := 0; index < 20; index++ {
		response := managementRequest(m, "PUT", "/admin/realms/uds/clients/"+record.ID(), token, map[string]any{"clientId": "same", "redirectUris": []string{"https://app.example.test/auth"}, "defaultClientScopes": []string{}})
		if response.Code != 204 {
			t.Fatal(response.Code)
		}
	}
	if store.writes != 0 || one.calls.Load() != 0 || two.calls.Load() != 0 {
		t.Fatalf("unchanged PUT wrote=%d dex=%d/%d", store.writes, one.calls.Load(), two.calls.Load())
	}
}

type blockedDex struct {
	DexClients
	block            atomic.Bool
	entered, release chan struct{}
}

func (d *blockedDex) ListClients(ctx context.Context, req *api.ListClientReq, options ...grpc.CallOption) (*api.ListClientResp, error) {
	if d.block.Load() {
		close(d.entered)
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-d.release:
			return nil, fmt.Errorf("second issuer failed after publication began")
		}
	}
	return d.DexClients.ListClients(ctx, req, options...)
}

func TestConcurrentUnrelatedGrantsSurviveRelatedPartialPublicationAndRestart(t *testing.T) {
	m, _, public, admin := managementFixture(t)
	second := &blockedDex{DexClients: admin, entered: make(chan struct{}), release: make(chan struct{})}
	m.Clients = NewReplicatedClients(m.Store, public, second)
	target := ClientRecord{Realm: "uds", Data: map[string]any{"id": "target", "clientId": "target", "secret": "target-secret", "redirectUris": []string{"https://target.example.test/auth"}}}
	peer := ClientRecord{Realm: "uds", Data: map[string]any{"id": "peer", "clientId": "peer", "secret": "peer-secret", "serviceAccountsEnabled": true, "protocolMappers": []map[string]any{{"protocolMapper": "oidc-audience-mapper", "config": map[string]string{"included.client.audience": "target", "access.token.claim": "true"}}}}}
	unrelated := ClientRecord{Realm: "uds", Data: map[string]any{"id": "unrelated", "clientId": "unrelated", "secret": "unrelated-secret"}}
	for _, record := range []ClientRecord{target, peer, unrelated} {
		if err := m.Clients.Save(t.Context(), record); err != nil {
			t.Fatal(err)
		}
	}
	before, err := m.Clients.readRecords(t.Context())
	if err != nil {
		t.Fatal(err)
	}
	oldDigest, err := publicationDigest(target, before)
	if err != nil {
		t.Fatal(err)
	}
	oldPeerDigest, err := publicationDigest(peer, before)
	if err != nil {
		t.Fatal(err)
	}
	user := User{ID: "real-user", Username: "person", Enabled: true}
	if err := m.Directory.Save(t.Context(), user); err != nil {
		t.Fatal(err)
	}
	second.block.Store(true)
	done := make(chan error, 1)
	go func() { target.Data["redirectUris"] = []string{}; done <- m.Clients.Save(t.Context(), target) }()
	select {
	case <-second.entered:
	case <-t.Context().Done():
		t.Fatal(t.Context().Err())
	}
	var reads sync.WaitGroup
	for worker := 0; worker < 8; worker++ {
		reads.Add(1)
		go func() {
			defer reads.Done()
			for read := 0; read < 10; read++ {
				if err := m.UserAllowed(t.Context(), "unrelated", user); err != nil {
					t.Error("unrelated user authority blocked", err)
				}
				if _, err := m.InteractiveScopes(t.Context(), "unrelated", "openid"); err != nil {
					t.Error("unrelated scope contract blocked", err)
				}
				if err := m.UserAllowed(t.Context(), "target", user); err == nil {
					t.Error("changed target published during partial write")
				}
				if err := m.UserAllowed(t.Context(), "peer", user); err == nil {
					t.Error("related audience peer published during partial write")
				}
			}
		}()
	}
	reads.Wait()
	close(second.release)
	if err := <-done; err == nil {
		t.Fatal("partial publication reported success")
	}
	restarted := NewManagement(m.Directory, m.Store, NewReplicatedClients(m.Store, public, admin), m.Sessions, m.Authority, m.PublicHost, m.AdminHost)
	if err := restarted.UserAllowed(t.Context(), "unrelated", user); err != nil {
		t.Fatal("restart blocked unrelated published client", err)
	}
	assertPrivateGrantFenced(t, restarted)
	// A delayed acknowledgement for the old desired revision cannot reopen a
	// changed client, even if it overwrites that client's pending marker.
	if err := m.Store.Put(t.Context(), "publication", recordKey(target), clientPublication{Digest: oldDigest}); err != nil {
		t.Fatal(err)
	}
	if err := restarted.UserAllowed(t.Context(), "target", user); err == nil {
		t.Fatal("stale publication acknowledgement reopened changed authority")
	}
	if err := m.Store.Put(t.Context(), "publication", recordKey(peer), clientPublication{Digest: oldPeerDigest}); err != nil {
		t.Fatal(err)
	}
	if err := restarted.UserAllowed(t.Context(), "peer", user); err == nil {
		t.Fatal("stale audience acknowledgement reopened a related peer")
	}
	if err := restarted.Clients.Restore(t.Context()); err != nil {
		t.Fatal(err)
	}
	if err := restarted.UserAllowed(t.Context(), "target", user); err != nil {
		t.Fatal("repaired target remained blocked", err)
	}
}
