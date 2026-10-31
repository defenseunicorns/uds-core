// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package devidentity

import (
	"context"
	"encoding/json"
	"time"
)

func (m *Management) PruneExpired(ctx context.Context) error {
	for _, kind := range []string{"session", "apitoken"} {
		entries, err := m.Store.List(ctx, kind)
		if err != nil {
			return err
		}
		for _, raw := range entries {
			if err := ctx.Err(); err != nil {
				return err
			}
			var entry struct {
				Digest  string    `json:"digest"`
				Expires time.Time `json:"expires"`
			}
			if err := json.Unmarshal(raw, &entry); err != nil {
				return err
			}
			if entry.Digest != "" && !m.now().Before(entry.Expires) {
				if err := m.Store.Delete(ctx, kind, entry.Digest); err != nil {
					return err
				}
			}
		}
	}
	return nil
}
