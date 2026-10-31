// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/coreos/go-oidc/v3/oidc"
)

type restartState struct {
	ClientID, ClientSecret, UserID, Username, Password, Email string
	PublicTokens, AdminTokens                                 protocolTokens
	PublicCookies, AdminCookies                               []*http.Cookie
}

func restartLifecycle(file string, verify, requireExpired bool) error {
	raw, err := os.ReadFile(file)
	if err != nil {
		return err
	}
	var cfg lifecycleConfig
	if err := json.Unmarshal(raw, &cfg); err != nil {
		return err
	}
	client, err := lifecycleClient(cfg)
	if err != nil {
		return err
	}
	p := &lifecycleProbe{cfg: cfg, client: client}
	stateFile := file + ".restart-state"
	if !verify {
		if err := p.setup(); err != nil {
			p.cleanup()
			return err
		}
		_, pub, err := p.authorize(cfg.PublicOrigin)
		if err != nil {
			p.cleanup()
			return err
		}
		_, admin, err := p.authorize(cfg.AdminOrigin)
		if err != nil {
			p.cleanup()
			return err
		}
		publicURL, _ := url.Parse(cfg.PublicOrigin)
		adminURL, _ := url.Parse(cfg.AdminOrigin)
		state := restartState{ClientID: p.clientID, ClientSecret: p.clientSecret, UserID: p.userID, Username: p.username, Password: p.password, Email: p.email, PublicTokens: pub, AdminTokens: admin, PublicCookies: client.Jar.Cookies(publicURL), AdminCookies: client.Jar.Cookies(adminURL)}
		raw, err := json.Marshal(state)
		if err != nil {
			return err
		}
		if err := os.WriteFile(stateFile, raw, 0600); err != nil {
			return err
		}
		prepared, _ := json.Marshal(map[string]any{"status": "prepared", "prepared_at": time.Now().UTC().Format(time.RFC3339), "real_public_admin_tokens": true, "persistent_state_and_browser_sessions_issued": true, "strict_tls": true})
		fmt.Println(string(prepared))
		return nil
	}
	raw, err = os.ReadFile(stateFile)
	if err != nil {
		return err
	}
	var state restartState
	if err := json.Unmarshal(raw, &state); err != nil {
		return err
	}
	p.clientID, p.clientSecret, p.userID, p.username, p.password, p.email = state.ClientID, state.ClientSecret, state.UserID, state.Username, state.Password, state.Email
	// Obtain fresh management authority after restart so cleanup does not rely
	// on an expired or rotated administrative bearer value.
	response, err := client.PostForm(cfg.AdminOrigin+"/realms/master/protocol/openid-connect/token", url.Values{"grant_type": {"password"}, "client_id": {"admin-cli"}, "username": {cfg.AdminUsername}, "password": {cfg.AdminPassword}})
	if err != nil {
		return err
	}
	var adminToken struct {
		Access string `json:"access_token"`
	}
	if response.StatusCode != 200 || json.NewDecoder(response.Body).Decode(&adminToken) != nil || adminToken.Access == "" {
		response.Body.Close()
		return fmt.Errorf("post-restart administrative authentication failed")
	}
	response.Body.Close()
	p.admin = adminToken.Access
	defer p.cleanup()
	for _, entry := range []struct {
		origin  string
		cookies []*http.Cookie
		tokens  protocolTokens
	}{{cfg.PublicOrigin, state.PublicCookies, state.PublicTokens}, {cfg.AdminOrigin, state.AdminCookies, state.AdminTokens}} {
		origin, _ := url.Parse(entry.origin)
		client.Jar.SetCookies(origin, entry.cookies)
		response, err := client.Get(entry.origin + "/realms/uds/account")
		if err != nil {
			return err
		}
		page, err := io.ReadAll(io.LimitReader(response.Body, 1<<20))
		response.Body.Close()
		if err != nil {
			return err
		}
		if response.StatusCode != 200 || !strings.Contains(string(page), "Authenticated") {
			return fmt.Errorf("restart lost a valid issuer-scoped browser session")
		}
		ctx := oidc.ClientContext(context.Background(), client)
		provider, err := oidc.NewProvider(ctx, entry.origin+"/realms/uds")
		if err != nil {
			return err
		}
		verifier := provider.Verifier(&oidc.Config{ClientID: p.clientID})
		old, err := verifier.Verify(ctx, entry.tokens.ID)
		if requireExpired {
			var expired *oidc.TokenExpiredError
			if !errors.As(err, &expired) {
				return fmt.Errorf("expected original five-minute token to be rejected as expired: %w", err)
			}
		} else if err != nil {
			return fmt.Errorf("restart lost signing authority: %w", err)
		}
		response, err = client.PostForm(provider.Endpoint().TokenURL, url.Values{"grant_type": {"refresh_token"}, "refresh_token": {entry.tokens.Refresh}, "client_id": {p.clientID}, "client_secret": {p.clientSecret}})
		if err != nil {
			return err
		}
		var tokens protocolTokens
		if response.StatusCode != 200 || json.NewDecoder(response.Body).Decode(&tokens) != nil {
			response.Body.Close()
			return fmt.Errorf("restart lost a valid refresh grant")
		}
		response.Body.Close()
		next, err := verifier.Verify(ctx, tokens.ID)
		if err != nil {
			return err
		}
		if !requireExpired && next.Nonce != old.Nonce {
			return fmt.Errorf("restart changed signed authorization nonce")
		}
		var claims struct {
			Email    string
			Groups   []string
			Verified bool   `json:"email_verified"`
			Username string `json:"preferred_username"`
		}
		if err := next.Claims(&claims); err != nil {
			return err
		}
		if claims.Email != p.email || !claims.Verified || claims.Username != p.username || strings.Join(claims.Groups, ",") != "/UDS Core/Admin" {
			return fmt.Errorf("post-restart signed directory claims differ")
		}
	}
	if err := os.Remove(stateFile); err != nil {
		return err
	}
	if requireExpired {
		fmt.Println(`{"status":"passed","scope":"browser_session_and_refresh_persistence","strict_tls":true,"original_id_tokens":"expired_and_rejected","original_id_token_validity_pass":false,"both_issuer_browser_sessions_persisted":true,"both_issuer_refresh_tokens_persisted":true,"fresh_signed_issuer_audience_directory_claims_verified":true,"original_signing_key_persistence":"unqualified_by_expired_token"}`)
	} else {
		fmt.Println(`{"status":"passed","strict_tls":true,"both_issuer_signing_keys_persisted":true,"directory_clients_browser_sessions_persisted":true,"real_refresh_survives_all_identity_process_recreation":true,"fresh_signed_issuer_audience_directory_claims_verified":true}`)
	}
	return nil
}
