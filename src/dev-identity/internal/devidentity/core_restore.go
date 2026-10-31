// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package devidentity

import "context"

// A stale or unavailable Package never restores a persisted CLI peer grant.
// Preserve desired state for the operator to repair; revoke only its affected
// Dex clients and publications, so unrelated clients can remain available.
func (c *Clients) currentCoreRecords(ctx context.Context, records []ClientRecord) ([]ClientRecord, map[string]bool, error) {
	active := append([]ClientRecord(nil), records...)
	invalid := map[string]bool{}
	for index, record := range records {
		if record.Deleted {
			continue
		}
		if err := c.validateCoreRecord(ctx, record); err == nil {
			continue
		}
		if err := c.fenceRelatedRecords(ctx, record, records); err != nil {
			return nil, nil, err
		}
		invalid[recordKey(record)] = true
		active[index].Deleted = true
	}
	return active, invalid, nil
}
