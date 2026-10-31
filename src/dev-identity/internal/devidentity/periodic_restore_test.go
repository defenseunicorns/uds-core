// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package devidentity

import (
	"context"
	"fmt"
	api "github.com/dexidp/dex/api/v2"
	"google.golang.org/grpc"
	"sync"
	"testing"
	"time"
)

type periodicBlockedDex struct {
	DexClients
	entered chan struct{}
	release chan struct{}
	block   bool
	once    sync.Once
}

func (d *periodicBlockedDex) ListClients(ctx context.Context, r *api.ListClientReq, o ...grpc.CallOption) (*api.ListClientResp, error) {
	if d.block {
		d.once.Do(func() { close(d.entered) })
		select {
		case <-d.release:
		case <-ctx.Done():
			return nil, ctx.Err()
		}
	}
	return d.DexClients.ListClients(ctx, r, o...)
}
func TestPeriodicRestoreDefersToActualMandatoryPublicationWithoutGlobalOutage(t *testing.T) {
	m, _, public, admin := managementFixture(t)
	unrelated := ClientRecord{Realm: "uds", Data: map[string]any{"id": "unrelated", "clientId": "unrelated", "secret": "secret", "publicClient": false}}
	changed := ClientRecord{Realm: "uds", Data: map[string]any{"id": "changed", "clientId": "changed", "secret": "secret", "publicClient": false, "name": "before"}}
	for _, record := range []ClientRecord{unrelated, changed} {
		if err := m.Clients.Save(t.Context(), record); err != nil {
			t.Fatal(err)
		}
	}
	blocked := &periodicBlockedDex{DexClients: admin, entered: make(chan struct{}), release: make(chan struct{}), block: true}
	m.Clients.dex = []DexClients{public, blocked}
	changed.Data["name"] = "after"
	done := make(chan error, 1)
	go func() { done <- m.Clients.Save(t.Context(), changed) }()
	<-blocked.entered
	deadline, cancel := context.WithTimeout(t.Context(), 20*time.Millisecond)
	defer cancel()
	completed, err := m.Clients.RestoreIfIdle(deadline)
	if completed || err != nil {
		t.Fatal("duplicate periodic reconciliation did not defer", completed, err)
	}
	if _, _, err := m.Clients.PublishedClient(t.Context(), "uds", "unrelated"); err != nil {
		t.Fatal("unrelated authority dropped while mandatory writer active", err)
	}
	if _, _, err := m.Clients.PublishedClient(t.Context(), "uds", "changed"); err == nil {
		t.Fatal("in-progress changed authority bypassed fence")
	}
	close(blocked.release)
	if err := <-done; err != nil {
		t.Fatal(err)
	}
	blocked.block = false
	if completed, err := m.Clients.RestoreIfIdle(t.Context()); !completed || err != nil {
		t.Fatal("idle reconciliation did not verify actual state", completed, err)
	}
	// Actual issuer failure is still reported; deferral is never fake success.
	failing := &unavailableDex{DexClients: admin, fail: true}
	m.Clients.dex = []DexClients{public, failing}
	if completed, err := m.Clients.RestoreIfIdle(t.Context()); !completed || err == nil {
		t.Fatal(fmt.Sprint("real periodic failure hidden ", completed, " ", err))
	}
}
