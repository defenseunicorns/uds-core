// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/url"

	"github.com/coreos/go-oidc/v3/oidc"
)

func (p *lifecycleProbe) verifyClearedClientPolicy(provider *oidc.Provider) error {
	client, err := p.managedClient(p.clientID)
	if err != nil {
		return err
	}
	if _, err := p.api("PUT", "clients/"+client.ID, map[string]any{"redirectUris": []string{}}); err != nil {
		return err
	}
	for _, origin := range []string{p.cfg.PublicOrigin, p.cfg.AdminOrigin} {
		query := url.Values{"client_id": {p.clientID}, "redirect_uri": {"https://native-callback.invalid/callback"}, "response_type": {"code"}, "scope": {"openid"}, "state": {"cleared-redirect-probe"}, "nonce": {"cleared-redirect-probe"}}
		response, err := p.client.Get(origin + "/realms/uds/protocol/openid-connect/auth?" + query.Encode())
		if err != nil {
			return err
		}
		response.Body.Close()
		if response.StatusCode < 400 {
			return fmt.Errorf("issuer accepted removed redirect policy: %d", response.StatusCode)
		}
	}
	if _, err := p.api("PUT", "clients/"+client.ID, map[string]any{"redirectUris": []string{"https://native-callback.invalid/callback"}}); err != nil {
		return err
	}
	peerID := p.clientID + "-probe"
	peer, err := p.managedClient(peerID)
	if err != nil {
		return err
	}
	if _, err := p.api("PUT", "clients/"+peer.ID, map[string]any{"protocolMappers": []any{}}); err != nil {
		return err
	}
	response, err := p.client.PostForm(provider.Endpoint().TokenURL, url.Values{"grant_type": {"client_credentials"}, "client_id": {peerID}, "client_secret": {peer.Secret}, "scope": {"audience:server:client_id:" + p.clientID}})
	if err != nil {
		return err
	}
	defer response.Body.Close()
	var tokens protocolTokens
	if response.StatusCode != 200 || json.NewDecoder(response.Body).Decode(&tokens) != nil || tokens.Access == "" {
		return fmt.Errorf("post-mapper-removal service-account grant failed: %d", response.StatusCode)
	}
	ctx := oidc.ClientContext(context.Background(), p.client)
	verified, err := provider.Verifier(&oidc.Config{ClientID: peerID}).Verify(ctx, tokens.Access)
	if err != nil {
		return err
	}
	if len(verified.Audience) != 1 || verified.Audience[0] != peerID {
		return fmt.Errorf("removed or request-injected service-account audience remained authorized")
	}
	return nil
}

func (p *lifecycleProbe) managedClient(id string) (struct{ ID, Secret string }, error) {
	var clients []struct{ ID, Secret string }
	raw, err := p.api("GET", "clients?clientId="+url.QueryEscape(id), nil)
	if err != nil {
		return struct{ ID, Secret string }{}, err
	}
	if json.Unmarshal(raw, &clients) != nil || len(clients) != 1 || clients[0].ID == "" {
		return struct{ ID, Secret string }{}, fmt.Errorf("exact owned client unavailable")
	}
	return clients[0], nil
}
