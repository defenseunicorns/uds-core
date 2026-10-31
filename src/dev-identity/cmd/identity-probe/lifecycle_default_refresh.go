// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/url"
	"strings"

	"github.com/coreos/go-oidc/v3/oidc"
)

func (p *lifecycleProbe) rotateDefaultGrant(provider *oidc.Provider, tokens *protocolTokens) error {
	ctx := oidc.ClientContext(context.Background(), p.client)
	verifier := provider.Verifier(&oidc.Config{ClientID: p.clientID})
	before, err := verifier.Verify(ctx, tokens.ID)
	if err != nil {
		return err
	}
	response, err := p.client.PostForm(provider.Endpoint().TokenURL, url.Values{"grant_type": {"refresh_token"}, "refresh_token": {tokens.Refresh}, "client_id": {p.clientID}, "client_secret": {p.clientSecret}})
	if err != nil {
		return err
	}
	defer response.Body.Close()
	var next protocolTokens
	if response.StatusCode != 200 || json.NewDecoder(response.Body).Decode(&next) != nil || next.ID == "" || next.Refresh == "" || next.Refresh == tokens.Refresh {
		return fmt.Errorf("ordinary default-scope refresh did not rotate: %d", response.StatusCode)
	}
	verified, err := verifier.Verify(ctx, next.ID)
	if err != nil {
		return err
	}
	var claims struct {
		Email, Name string
		Username    string `json:"preferred_username"`
		Groups      []string
	}
	if verified.Claims(&claims) != nil || verified.Nonce != before.Nonce || claims.Email != p.email || claims.Name == "" || claims.Username != p.username || strings.Join(claims.Groups, ",") != "/UDS Core/Admin" {
		return fmt.Errorf("ordinary refresh changed signed identity or authorization binding")
	}
	if err := p.rejectRefresh(provider, tokens.Refresh); err != nil {
		return fmt.Errorf("ordinary refresh reused a rotated grant: %w", err)
	}
	*tokens = next
	return nil
}
