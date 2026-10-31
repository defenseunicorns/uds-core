// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
package devidentity

import (
	"context"
	"encoding/hex"
	"encoding/json"
	"fmt"
)

// A disabled configuration rejects requests immediately and removes its Fleet
// bearer grants before serving. Re-enabling cannot revive those earlier grants.
// Admin/operator credentials and real OIDC grants retain their own authority.
func RevokeDisabledFleetTokens(ctx context.Context, state StateStore, enabled bool) error {
	if enabled {
		return nil
	}
	records, err := state.List(ctx, "apitoken")
	if err != nil {
		return err
	}
	for _, raw := range records {
		if err := ctx.Err(); err != nil {
			return err
		}
		var token apiToken
		if err := json.Unmarshal(raw, &token); err != nil {
			return fmt.Errorf("read management token authority: %w", err)
		}
		if token.Principal.Role != "fleet" {
			continue
		}
		if decoded, err := hex.DecodeString(token.Digest); err != nil || len(decoded) != 32 {
			return fmt.Errorf("invalid persisted Fleet token digest")
		}
		if err := state.Delete(ctx, "apitoken", token.Digest); err != nil {
			return err
		}
	}
	return nil
}
