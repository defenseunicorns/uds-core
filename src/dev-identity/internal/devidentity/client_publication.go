// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package devidentity

import (
	"context"
	"fmt"
	"slices"

	api "github.com/dexidp/dex/api/v2"
)

func clientNeedsReplacement(actual, desired *api.Client) bool {
	// Dex's UpdateClient ignores nil repeated fields and empty names. Empty
	// repeated protobuf fields decode as nil, so clearing cannot use that RPC.
	return actual.Secret != desired.Secret || actual.Public != desired.Public ||
		(actual.Name != "" && desired.Name == "") ||
		(len(actual.RedirectUris) > 0 && len(desired.RedirectUris) == 0) ||
		(len(actual.TrustedPeers) > 0 && len(desired.TrustedPeers) == 0)
}

func (c *Clients) RequirePublished(ctx context.Context) error {
	var published bool
	if err := c.store.Get(ctx, "config", "client-publication", &published); err != nil {
		return err
	}
	if !published {
		return fmt.Errorf("client publication incomplete")
	}
	return nil
}

func verifyClientPublication(ctx context.Context, dex DexClients, desired *api.Client) error {
	actual, err := dex.GetClient(ctx, &api.GetClientReq{Id: desired.Id})
	if err != nil {
		return err
	}
	if actual == nil || actual.Client == nil {
		return fmt.Errorf("Dex client representation unavailable")
	}
	client := actual.Client
	if client.Secret != desired.Secret || client.Public != desired.Public || client.Name != desired.Name || !slices.Equal(client.RedirectUris, desired.RedirectUris) || !slices.Equal(client.TrustedPeers, desired.TrustedPeers) {
		return fmt.Errorf("Dex client publication did not match desired state")
	}
	return nil
}
