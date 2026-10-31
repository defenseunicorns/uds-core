// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package main

import (
	"context"
	"encoding/json"
	"fmt"
	"html"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"

	"github.com/coreos/go-oidc/v3/oidc"
	"github.com/google/uuid"
)

func (p *lifecycleProbe) authorize(origin string) (*oidc.Provider, protocolTokens, error) {
	return p.authorizeScopes(origin, "openid profile email groups offline_access")
}

func (p *lifecycleProbe) authorizeScopes(origin, scopes string) (*oidc.Provider, protocolTokens, error) {
	ctx := oidc.ClientContext(context.Background(), p.client)
	provider, err := oidc.NewProvider(ctx, origin+"/realms/uds")
	if err != nil {
		return nil, protocolTokens{}, err
	}
	nonce, state := uuid.NewString(), uuid.NewString()
	query := url.Values{"client_id": {p.clientID}, "redirect_uri": {"https://native-callback.invalid/callback"}, "response_type": {"code"}, "scope": {scopes}, "state": {state}, "nonce": {nonce}}
	request, err := http.NewRequest("GET", provider.Endpoint().AuthURL+"?"+query.Encode(), nil)
	if err != nil {
		return nil, protocolTokens{}, err
	}
	request.Header.Set("X-Remote-User", "untrusted-user")
	request.Header.Set("X-Remote-Group", "untrusted-admin")
	response, err := p.client.Do(request)
	if err != nil {
		return nil, protocolTokens{}, err
	}
	page, err := io.ReadAll(io.LimitReader(response.Body, 1<<20))
	response.Body.Close()
	if err != nil {
		return nil, protocolTokens{}, err
	}
	callback, err := url.Parse(response.Header.Get("Location"))
	if err != nil {
		return nil, protocolTokens{}, err
	}
	if callback.Host != "native-callback.invalid" {
		fields := regexp.MustCompile(`name="(csrf|return)" value="([^"]*)"`).FindAllStringSubmatch(string(page), -1)
		form := url.Values{"username": {p.username}, "password": {p.password}}
		for _, field := range fields {
			form.Set(field[1], html.UnescapeString(field[2]))
		}
		if form.Get("csrf") == "" {
			return nil, protocolTokens{}, fmt.Errorf("real credential form not reached: %d", response.StatusCode)
		}
		response, err = p.client.PostForm(origin+"/login", form)
		if err != nil {
			return nil, protocolTokens{}, err
		}
		response, err = completeLoginNavigation(p.client, response, origin)
		if err != nil {
			return nil, protocolTokens{}, err
		}
		response.Body.Close()
		callback, err = url.Parse(response.Header.Get("Location"))
		if err != nil {
			return nil, protocolTokens{}, err
		}
	}
	if callback.Host != "native-callback.invalid" || callback.Query().Get("state") != state || callback.Query().Get("code") == "" {
		return nil, protocolTokens{}, fmt.Errorf("authorization callback/state mismatch")
	}
	response, err = p.client.PostForm(provider.Endpoint().TokenURL, url.Values{"grant_type": {"authorization_code"}, "code": {callback.Query().Get("code")}, "redirect_uri": {"https://native-callback.invalid/callback"}, "client_id": {p.clientID}, "client_secret": {p.clientSecret}})
	if err != nil {
		return nil, protocolTokens{}, err
	}
	defer response.Body.Close()
	var tokens protocolTokens
	if response.StatusCode != 200 || json.NewDecoder(response.Body).Decode(&tokens) != nil || tokens.ID == "" || tokens.Refresh == "" {
		return nil, tokens, fmt.Errorf("real code exchange failed: %d", response.StatusCode)
	}
	verified, err := provider.Verifier(&oidc.Config{ClientID: p.clientID}).Verify(ctx, tokens.ID)
	if err != nil {
		return nil, tokens, err
	}
	if verified.Nonce != nonce {
		return nil, tokens, fmt.Errorf("signed nonce differs")
	}
	var claims struct {
		Email    string
		Groups   []string
		Verified bool   `json:"email_verified"`
		Username string `json:"preferred_username"`
		Name     string `json:"name"`
	}
	if err := verified.Claims(&claims); err != nil {
		return nil, tokens, err
	}
	if claims.Email != p.email || !claims.Verified || claims.Username != p.username || claims.Name == "" || strings.Join(claims.Groups, ",") != "/UDS Core/Admin" {
		return nil, tokens, fmt.Errorf("signed directory claims differ")
	}
	return provider, tokens, nil
}

func (p *lifecycleProbe) rejectRefresh(provider *oidc.Provider, refresh string) error {
	response, err := p.client.PostForm(provider.Endpoint().TokenURL, url.Values{"grant_type": {"refresh_token"}, "refresh_token": {refresh}, "client_id": {p.clientID}, "client_secret": {p.clientSecret}})
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if response.StatusCode < 400 {
		return fmt.Errorf("revoked identity received a successful refresh")
	}
	return nil
}

func (p *lifecycleProbe) serviceGrant(provider *oidc.Provider) error {
	id := p.clientID + "-probe"
	if _, err := p.api("POST", "clients", map[string]any{"clientId": id, "enabled": true, "publicClient": false, "standardFlowEnabled": false, "serviceAccountsEnabled": true, "protocolMappers": []map[string]any{{"protocolMapper": "oidc-audience-mapper", "config": map[string]string{"included.client.audience": p.clientID, "access.token.claim": "true", "id.token.claim": "false"}}}}); err != nil {
		return err
	}
	raw, err := p.api("GET", "clients?clientId="+url.QueryEscape(id), nil)
	if err != nil {
		return err
	}
	var clients []struct {
		Secret string `json:"secret"`
	}
	if json.Unmarshal(raw, &clients) != nil || len(clients) != 1 || clients[0].Secret == "" {
		return fmt.Errorf("service-account credential unavailable")
	}
	response, err := p.client.PostForm(provider.Endpoint().TokenURL, url.Values{"grant_type": {"client_credentials"}, "client_id": {id}, "client_secret": {clients[0].Secret}, "scope": {"audience:server:client_id:untrusted"}})
	if err != nil {
		return err
	}
	defer response.Body.Close()
	var tokens protocolTokens
	if response.StatusCode != 200 || json.NewDecoder(response.Body).Decode(&tokens) != nil || tokens.Access == "" {
		return fmt.Errorf("real service-account exchange failed: %d", response.StatusCode)
	}
	ctx := oidc.ClientContext(context.Background(), p.client)
	verified, err := provider.Verifier(&oidc.Config{ClientID: p.clientID}).Verify(ctx, tokens.Access)
	if err != nil {
		return err
	}
	if len(verified.Audience) != 2 {
		return fmt.Errorf("service-account audiences differ")
	}
	for _, aud := range verified.Audience {
		if aud != p.clientID && aud != id {
			return fmt.Errorf("request-injected audience became authority")
		}
	}
	return nil
}
