// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package devidentity

import (
	"context"
	api "github.com/dexidp/dex/api/v2"
	"google.golang.org/grpc"
	"testing"
)

func TestOldTombstoneCannotDeleteRecreatedLogicalClientInEitherOrder(t *testing.T) {
	for _, reverse := range []bool{false, true} {
		m, _, public, admin := managementFixture(t)
		old := ClientRecord{Realm: "uds", Deleted: true, Data: map[string]any{"id": "old-uuid", "clientId": "same-client", "publicClient": false, "secret": "old-secret"}}
		successor := ClientRecord{Realm: "uds", Data: map[string]any{"id": "new-uuid", "clientId": "same-client", "publicClient": false, "secret": "new-secret", "redirectUris": []string{"https://new.example.test/login"}}}
		records := []ClientRecord{old, successor}
		if reverse {
			records = []ClientRecord{successor, old}
		}
		for _, r := range records {
			if err := m.Store.Put(t.Context(), "client", recordKey(r), r); err != nil {
				t.Fatal(err)
			}
		}
		for _, d := range []*testDex{public, admin} {
			present := map[string]bool{}
			for _, record := range records {
				if err := m.Clients.synchronizeOne(t.Context(), d, record, records, present); err != nil {
					t.Fatal(err)
				}
			}
			if _, err := d.GetClient(t.Context(), &api.GetClientReq{Id: "same-client"}); err != nil {
				t.Fatal("explicit ordering deleted successor", err)
			}
		}
		if err := m.Clients.Restore(t.Context()); err != nil {
			t.Fatal(err)
		}
		// Persisted restart replays tombstones again; current authority survives.
		rebuilt := NewReplicatedClients(m.Store, public, admin)
		if err := rebuilt.Restore(t.Context()); err != nil {
			t.Fatal(err)
		}
		for _, d := range []*testDex{public, admin} {
			c, err := d.GetClient(t.Context(), &api.GetClientReq{Id: "same-client"})
			if err != nil || c.Client.Secret != "new-secret" {
				t.Fatal("old finalization targeted new state UUID", err)
			}
		}
		if _, _, err := rebuilt.PublishedClient(t.Context(), "uds", "same-client"); err != nil {
			t.Fatal(err)
		}
	}
}

type vanishedFinalDex struct {
	DexClients
	lists  int
	vanish bool
}

func (d *vanishedFinalDex) ListClients(ctx context.Context, r *api.ListClientReq, o ...grpc.CallOption) (*api.ListClientResp, error) {
	result, err := d.DexClients.ListClients(ctx, r, o...)
	d.lists++
	if err == nil && d.vanish && d.lists%2 == 0 {
		result.Clients = nil
	}
	return result, err
}
func TestFinalCatalogueMismatchCannotReleaseOrRetainPublication(t *testing.T) {
	m, _, public, admin := managementFixture(t)
	record := ClientRecord{Realm: "uds", Data: map[string]any{"id": "own", "clientId": "own", "secret": "secret", "publicClient": false}}
	if err := m.Clients.Save(t.Context(), record); err != nil {
		t.Fatal(err)
	}
	final := &vanishedFinalDex{DexClients: public, vanish: true}
	m.Clients.dex = []DexClients{final, admin}
	if err := m.Clients.Restore(t.Context()); err == nil {
		t.Fatal("final catalogue mismatch reported success")
	}
	if _, _, err := m.Clients.PublishedClient(t.Context(), "uds", "own"); err == nil {
		t.Fatal("lost current client retained publication")
	}
}
