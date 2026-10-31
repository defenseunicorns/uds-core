// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package main

import (
	"bytes"
	"context"
	"crypto/tls"
	"crypto/x509"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/cookiejar"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/google/uuid"
)

type lifecycleConfig struct {
	RootCA, PublicOrigin, AdminOrigin string
	AdminUsername, AdminPassword      string
	HostIPs                           map[string]string
}

type protocolTokens struct {
	ID      string `json:"id_token"`
	Access  string `json:"access_token"`
	Refresh string `json:"refresh_token"`
}

type lifecycleProbe struct {
	cfg                                                       lifecycleConfig
	client                                                    *http.Client
	admin                                                     string
	clientID, clientSecret, userID, username, password, email string
}

func lifecycle(file string) error {
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
	defer p.cleanup()
	if err := p.setup(); err != nil {
		return err
	}
	if err := p.browserContract(); err != nil {
		return err
	}
	public, publicTokens, err := p.authorizeScopes(cfg.PublicOrigin, "openid")
	if err != nil {
		return err
	}
	adminProvider, adminTokens, err := p.authorizeScopes(cfg.AdminOrigin, "openid profile")
	if err != nil {
		return err
	}
	if publicTokens.ID == adminTokens.ID {
		return fmt.Errorf("issuers returned identical identity tokens")
	}
	if err := p.rotateDefaultGrant(public, &publicTokens); err != nil {
		return err
	}
	if err := p.rotateDefaultGrant(adminProvider, &adminTokens); err != nil {
		return err
	}
	if err := p.serviceGrant(public); err != nil {
		return err
	}
	if err := p.verifyClearedClientPolicy(public); err != nil {
		return err
	}
	group, err := p.groupID()
	if err != nil {
		return err
	}
	if _, err := p.api("DELETE", "users/"+p.userID+"/groups/"+group, nil); err != nil {
		return err
	}
	if err := p.rejectRefresh(public, publicTokens.Refresh); err != nil {
		return fmt.Errorf("group revocation: %w", err)
	}
	if _, err := p.api("PUT", "users/"+p.userID+"/groups/"+group, nil); err != nil {
		return err
	}
	_, next, err := p.authorize(cfg.PublicOrigin)
	if err != nil {
		return err
	}
	if _, err := p.api("PUT", "users/"+p.userID, map[string]bool{"enabled": false}); err != nil {
		return err
	}
	if err := p.rejectRefresh(public, next.Refresh); err != nil {
		return fmt.Errorf("disabled user: %w", err)
	}
	if _, err := p.api("PUT", "users/"+p.userID, map[string]bool{"enabled": true}); err != nil {
		return err
	}
	if err := p.rejectRefresh(public, next.Refresh); err != nil {
		return fmt.Errorf("reenabling resumed old credential authority: %w", err)
	}
	fmt.Println(`{"status":"passed","strict_tls":true,"real_public_and_admin_issuers":true,"signed_issuer_audience_nonce_email_groups":true,"openid_only_signed_profile_email_groups_and_refresh":true,"openid_profile_signed_groups_and_refresh":true,"ordinary_refresh_rotation_rejects_old_grants":true,"real_service_account_audience":true,"cleared_redirect_rejected_by_both_issuers":true,"cleared_service_account_audience":true,"group_revocation":true,"disabled_user":true,"reenable_fences_old_refresh":true}`)
	return nil
}

func lifecycleClient(cfg lifecycleConfig) (*http.Client, error) {
	raw, err := os.ReadFile(cfg.RootCA)
	if err != nil {
		return nil, err
	}
	roots := x509.NewCertPool()
	if !roots.AppendCertsFromPEM(raw) {
		return nil, fmt.Errorf("invalid lifecycle trust root")
	}
	dial := &net.Dialer{Timeout: 5 * time.Second}
	transport := &http.Transport{TLSClientConfig: &tls.Config{RootCAs: roots, MinVersion: tls.VersionTLS12}, DialContext: func(ctx context.Context, network, address string) (net.Conn, error) {
		host, port, err := net.SplitHostPort(address)
		if err != nil {
			return nil, err
		}
		if ip := cfg.HostIPs[host]; ip != "" {
			address = net.JoinHostPort(ip, port)
		}
		return dial.DialContext(ctx, network, address)
	}}
	jar, _ := cookiejar.New(nil)
	return &http.Client{Transport: transport, Jar: jar, Timeout: 15 * time.Second, CheckRedirect: func(request *http.Request, via []*http.Request) error {
		if request.URL.Host == "native-callback.invalid" {
			return http.ErrUseLastResponse
		}
		if len(via) > 12 {
			return fmt.Errorf("identity redirect loop")
		}
		return nil
	}}, nil
}

func (p *lifecycleProbe) setup() error {
	response, err := p.client.PostForm(p.cfg.AdminOrigin+"/realms/master/protocol/openid-connect/token", url.Values{"grant_type": {"password"}, "client_id": {"admin-cli"}, "username": {p.cfg.AdminUsername}, "password": {p.cfg.AdminPassword}})
	if err != nil {
		return err
	}
	defer response.Body.Close()
	var token struct {
		Access string `json:"access_token"`
	}
	if response.StatusCode != 200 || json.NewDecoder(response.Body).Decode(&token) != nil || token.Access == "" {
		return fmt.Errorf("administrative credential exchange failed: %d", response.StatusCode)
	}
	p.admin = token.Access
	suffix := strings.ReplaceAll(uuid.NewString(), "-", "")[:12]
	p.clientID = "native-e2e-client-" + suffix
	p.username = "native-e2e-user-" + suffix
	p.password = uuid.NewString() + "Aa!"
	p.email = p.username + "@example.test"
	if _, err := p.api("POST", "clients", map[string]any{"clientId": p.clientID, "enabled": true, "publicClient": false, "standardFlowEnabled": true, "redirectUris": []string{"https://native-callback.invalid/callback"}, "webOrigins": []string{"https://native-callback.invalid"}, "attributes": map[string]string{"uds.core.groups": `{"anyOf":["/UDS Core/Admin"]}`}}); err != nil {
		return err
	}
	clients, err := p.api("GET", "clients?clientId="+url.QueryEscape(p.clientID), nil)
	if err != nil {
		return err
	}
	var representations []struct {
		Secret string `json:"secret"`
	}
	if json.Unmarshal(clients, &representations) != nil || len(representations) != 1 || representations[0].Secret == "" {
		return fmt.Errorf("managed confidential client secret unavailable")
	}
	p.clientSecret = representations[0].Secret
	if _, err := p.api("POST", "users", map[string]any{"username": p.username, "email": p.email, "emailVerified": true, "enabled": true, "groups": []string{"/UDS Core/Admin"}, "credentials": []map[string]any{{"type": "password", "value": p.password, "temporary": false}}}); err != nil {
		return err
	}
	users, err := p.api("GET", "users?username="+url.QueryEscape(p.username)+"&exact=true", nil)
	if err != nil {
		return err
	}
	var people []struct {
		ID string `json:"id"`
	}
	if json.Unmarshal(users, &people) != nil || len(people) != 1 {
		return fmt.Errorf("managed user unavailable")
	}
	p.userID = people[0].ID
	return nil
}

func (p *lifecycleProbe) api(method, path string, body any) ([]byte, error) {
	raw, _ := json.Marshal(body)
	request, err := http.NewRequest(method, p.cfg.AdminOrigin+"/admin/realms/uds/"+path, bytes.NewReader(raw))
	if err != nil {
		return nil, err
	}
	request.Header.Set("Authorization", "Bearer "+p.admin)
	request.Header.Set("Content-Type", "application/json")
	response, err := p.client.Do(request)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()
	if response.StatusCode >= 400 {
		return nil, fmt.Errorf("management %s %s failed: %d", method, strings.Split(path, "?")[0], response.StatusCode)
	}
	return io.ReadAll(io.LimitReader(response.Body, 1<<20))
}

func (p *lifecycleProbe) groupID() (string, error) {
	raw, err := p.api("GET", "group-by-path/%2FUDS%20Core%2FAdmin", nil)
	if err != nil {
		return "", err
	}
	var group struct {
		ID string `json:"id"`
	}
	if json.Unmarshal(raw, &group) != nil || group.ID == "" {
		return "", fmt.Errorf("admin group unavailable")
	}
	return group.ID, nil
}

func (p *lifecycleProbe) cleanup() {
	if p.admin == "" || p.clientID == "" {
		return
	}
	if p.userID != "" {
		_, _ = p.api("DELETE", "users/"+p.userID, nil)
	}
	for _, id := range []string{p.clientID, p.clientID + "-probe"} {
		raw, err := p.api("GET", "clients?clientId="+url.QueryEscape(id), nil)
		if err != nil {
			continue
		}
		var clients []struct {
			ID string `json:"id"`
		}
		if json.Unmarshal(raw, &clients) == nil {
			for _, client := range clients {
				_, _ = p.api("DELETE", "clients/"+client.ID, nil)
			}
		}
	}
}
