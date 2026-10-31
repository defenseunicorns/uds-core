// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package devidentity

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"slices"
	"strings"
)

const clientGenerationScopePrefix = "uds:package-generation:"

// This is a grant binding, not an identity claim or additional authority.
// Dex persists the original scope in its code/refresh state. Current identity
// must match that original Package UID and exact authorized client pair.
func clientGeneration(client ClientRecord, records []ClientRecord) (string, error) {
	if client.CoreOwner == nil {
		return "", nil
	}
	type target struct {
		ClientID string
		Owner    *CoreClientOwner
	}
	targets := []target{}
	ids := publicAudienceTargets(client.Data)
	slices.Sort(ids)
	ids = slices.Compact(ids)
	for _, id := range ids {
		found := false
		for _, record := range records {
			if record.ClientID() == id && record.Realm == client.Realm && !record.Deleted && sameCoreOwner(client.CoreOwner, record.CoreOwner) {
				targets = append(targets, target{id, record.CoreOwner})
				found = true
				break
			}
		}
		if !found {
			return "", fmt.Errorf("grant target generation unavailable")
		}
	}
	raw, err := json.Marshal(struct {
		ClientID string
		Owner    *CoreClientOwner
		Targets  []target
	}{client.ClientID(), client.CoreOwner, targets})
	if err != nil {
		return "", err
	}
	digest := sha256.Sum256(raw)
	return hex.EncodeToString(digest[:]), nil
}
func rejectReservedGrantScopes(scopes string) error {
	for _, scope := range strings.Fields(scopes) {
		if strings.HasPrefix(scope, clientGenerationScopePrefix) {
			return fmt.Errorf("reserved grant-generation scope cannot be requested")
		}
	}
	return nil
}
func (m *Management) userGrantGeneration(ctx context.Context, clientID, generation string) error {
	client, records, err := m.Clients.PublishedClient(ctx, "uds", clientID)
	if err != nil {
		return err
	}
	if err := m.validatePublishedCorePair(ctx, client); err != nil {
		return err
	}
	return validateGrantGeneration(client, records, generation)
}

func validateGrantGeneration(client ClientRecord, records []ClientRecord, generation string) error {
	expected, err := clientGeneration(client, records)
	if err != nil {
		return err
	}
	if generation != expected {
		return fmt.Errorf("original grant generation no longer authorized")
	}
	return nil
}
