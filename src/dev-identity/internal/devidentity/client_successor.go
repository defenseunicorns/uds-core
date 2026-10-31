// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package devidentity

import (
	"context"
	"fmt"
	api "github.com/dexidp/dex/api/v2"
	"slices"
)

// A retained deletion record describes its old state UUID. It cannot finalize
// a newer live client that reuses the same logical Dex ID.
func hasLiveClientSuccessor(deleted ClientRecord, records []ClientRecord) bool {
	for _, other := range records {
		if !other.Deleted && other.Enabled() && other.DexID() == deleted.DexID() && recordKey(other) != recordKey(deleted) {
			return true
		}
	}
	return false
}
func (c *Clients) verifyFinalCatalogue(ctx context.Context, dex DexClients, records []ClientRecord) error {
	actual, err := dex.ListClients(ctx, &api.ListClientReq{})
	if err != nil {
		return err
	}
	byID := map[string]*api.ClientInfo{}
	for _, entry := range actual.Clients {
		byID[entry.Id] = entry
	}
	for _, record := range records {
		if record.Deleted && hasLiveClientSuccessor(record, records) {
			continue
		}
		entry := byID[record.DexID()]
		if record.Deleted || !record.Enabled() {
			if entry == nil {
				continue
			}
		} else {
			name, _ := record.Data["name"].(string)
			if entry != nil && entry.Public == record.Public() && entry.Name == name && slices.Equal(entry.RedirectUris, stringsField(record.Data, "redirectUris")) && slices.Equal(entry.TrustedPeers, trustedPeers(record, records)) {
				continue
			}
		}
		if err := c.fenceRelatedRecords(ctx, record, records); err != nil {
			return err
		}
		return fmt.Errorf("final Dex client catalogue does not match current authority")
	}
	return nil
}
