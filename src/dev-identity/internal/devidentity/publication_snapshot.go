// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package devidentity

import (
	"context"
	"encoding/json"
	"fmt"
)

type stateBatchReader interface {
	ReadMany(context.Context, string, []string) (map[string][]byte, error)
}

// Read exact keyed publication acknowledgements in one API snapshot. This is
// scoped to a serialized reconciliation; token authorization still reads its
// current individual publication and never uses a stale process cache.
func (c *Clients) publishSnapshot(ctx context.Context, records, active []ClientRecord, invalid map[string]bool) error {
	reader, ok := c.store.(stateBatchReader)
	if !ok {
		for _, record := range records {
			if !invalid[recordKey(record)] {
				if err := c.publishRecord(ctx, record, active); err != nil {
					return err
				}
			}
		}
		return nil
	}
	keys := make([]string, 0, len(records))
	for _, record := range records {
		if !invalid[recordKey(record)] {
			keys = append(keys, recordKey(record))
		}
	}
	acknowledgements, err := reader.ReadMany(ctx, "publication", keys)
	if err != nil {
		return err
	}
	for _, record := range records {
		key := recordKey(record)
		if invalid[key] {
			continue
		}
		digest, err := publicationDigest(record, active)
		if err != nil {
			return err
		}
		var prior clientPublication
		if raw, found := acknowledgements[key]; found {
			if err := json.Unmarshal(raw, &prior); err != nil {
				return fmt.Errorf("invalid exact publication acknowledgement: %w", err)
			}
			if prior.Digest == digest {
				continue
			}
		}
		if err := c.store.Put(ctx, "publication", key, clientPublication{Digest: digest}); err != nil {
			return err
		}
	}
	return nil
}
