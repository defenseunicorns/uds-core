// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package main

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"encoding/json"
	"fmt"
	oidc "github.com/coreos/go-oidc/v3/oidc"
	"html"
	"io"
	"net"
	"net/http"
	"net/http/cookiejar"
	"net/url"
	"os"
	"regexp"
	"strings"
	"time"
)

func main() {
	if len(os.Args) == 3 && (os.Args[1] == "--restart-prepare" || os.Args[1] == "--restart-verify" || os.Args[1] == "--restart-persistence") {
		must(restartLifecycle(os.Args[2], os.Args[1] != "--restart-prepare", os.Args[1] == "--restart-persistence"))
		return
	}
	if len(os.Args) == 3 && os.Args[1] == "--lifecycle" {
		must(lifecycle(os.Args[2]))
		return
	}
	if len(os.Args) != 3 {
		panic("supply owned node IP and CA file")
	}
	roots := x509.NewCertPool()
	pem, err := os.ReadFile(os.Args[2])
	must(err)
	if !roots.AppendCertsFromPEM(pem) {
		panic("invalid CA")
	}
	dialer := &net.Dialer{Timeout: 5 * time.Second}
	transport := &http.Transport{TLSClientConfig: &tls.Config{RootCAs: roots, MinVersion: tls.VersionTLS12}, DialContext: func(ctx context.Context, network, address string) (net.Conn, error) {
		host, port, err := net.SplitHostPort(address)
		if err != nil {
			return nil, err
		}
		if host == "sso.uds.dev" {
			address = net.JoinHostPort(os.Args[1], port)
		}
		return dialer.DialContext(ctx, network, address)
	}}
	jar, _ := cookiejar.New(nil)
	client := &http.Client{Transport: transport, Jar: jar, Timeout: 15 * time.Second, CheckRedirect: func(r *http.Request, via []*http.Request) error {
		if r.URL.Host == "app.example.test" {
			return http.ErrUseLastResponse
		}
		return nil
	}}
	ctx := oidc.ClientContext(context.Background(), client)
	issuer := "https://sso.uds.dev:18443/realms/uds"
	provider, err := oidc.NewProvider(ctx, issuer)
	must(err)
	query := url.Values{"client_id": {"probe-app"}, "redirect_uri": {"https://app.example.test/callback"}, "response_type": {"code"}, "scope": {"openid profile email groups offline_access"}, "state": {"owned-probe-state"}, "nonce": {"owned-probe-nonce"}}
	response, err := client.Get(provider.Endpoint().AuthURL + "?" + query.Encode())
	must(err)
	page, err := io.ReadAll(io.LimitReader(response.Body, 1<<20))
	response.Body.Close()
	must(err)
	fields := regexp.MustCompile(`name="(csrf|return)" value="([^"]*)"`).FindAllStringSubmatch(string(page), -1)
	form := url.Values{"username": {"doug"}, "password": {"unicorn123!@#UN"}}
	for _, field := range fields {
		form.Set(field[1], html.UnescapeString(field[2]))
	}
	if form.Get("csrf") == "" {
		panic("identity sign-in form not reached")
	}
	response, err = client.PostForm("https://sso.uds.dev:18443/login", form)
	must(err)
	response, err = completeLoginNavigation(client, response, "https://sso.uds.dev:18443")
	must(err)
	response.Body.Close()
	callback, err := url.Parse(response.Header.Get("Location"))
	must(err)
	if callback.Host != "app.example.test" || callback.Query().Get("state") != "owned-probe-state" {
		panic("authorization callback mismatch")
	}
	code := callback.Query().Get("code")
	if code == "" {
		panic("missing authorization code")
	}
	tokenResponse, err := client.PostForm(provider.Endpoint().TokenURL, url.Values{"grant_type": {"authorization_code"}, "code": {code}, "redirect_uri": {"https://app.example.test/callback"}, "client_id": {"probe-app"}, "client_secret": {"probe-confidential-client-secret"}})
	must(err)
	var tokens struct {
		IDToken      string `json:"id_token"`
		RefreshToken string `json:"refresh_token"`
	}
	must(json.NewDecoder(io.LimitReader(tokenResponse.Body, 1<<20)).Decode(&tokens))
	tokenResponse.Body.Close()
	verifier := provider.Verifier(&oidc.Config{ClientID: "probe-app"})
	id, err := verifier.Verify(ctx, tokens.IDToken)
	must(err)
	if id.Nonce != "owned-probe-nonce" {
		panic("nonce mismatch")
	}
	var claims struct {
		Groups []string
		Email  string
	}
	must(id.Claims(&claims))
	if strings.Join(claims.Groups, ",") != "/UDS Core/Admin" || claims.Email != "doug@example.test" {
		panic("identity/group claims differ")
	}
	if tokens.RefreshToken == "" {
		panic("refresh token was not issued")
	}
	refreshed, err := client.PostForm(provider.Endpoint().TokenURL, url.Values{"grant_type": {"refresh_token"}, "refresh_token": {tokens.RefreshToken}, "client_id": {"probe-app"}, "client_secret": {"probe-confidential-client-secret"}})
	must(err)
	var renewal struct {
		IDToken string `json:"id_token"`
	}
	must(json.NewDecoder(io.LimitReader(refreshed.Body, 1<<20)).Decode(&renewal))
	refreshed.Body.Close()
	_, err = verifier.Verify(ctx, renewal.IDToken)
	must(err)
	fmt.Println(`{"status":"passed","real_dex_signed_oidc":true,"issuer_audience_nonce_verified":true,"password_login":true,"group_claims":true,"mtls_identity_refresh":true,"tls_verification":true}`)
}

func must(err error) {
	if err != nil {
		panic(err)
	}
}
