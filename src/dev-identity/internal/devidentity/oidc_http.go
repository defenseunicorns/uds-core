// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package devidentity

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"slices"
	"strconv"
	"strings"
)

// Browser origins are compared as complete origins, never by hostname suffix.
func validOrigin(origin string) bool {
	parsed, err := url.Parse(origin)
	return err == nil && (parsed.Scheme == "https" || parsed.Scheme == "http") && parsed.Host != "" && parsed.User == nil && parsed.Path == "" && parsed.RawQuery == "" && parsed.Fragment == "" && parsed.String() == origin
}

func allowOrigin(writer http.ResponseWriter, origin string) {
	writer.Header().Set("Access-Control-Allow-Origin", origin)
	writer.Header().Set("Access-Control-Allow-Credentials", "true")
	writer.Header().Add("Vary", "Origin")
	writer.Header().Set("Cache-Control", "no-store")
}

func (b *Bridge) publicProtocolHeaders(writer http.ResponseWriter, request *http.Request) bool {
	path := request.URL.Path
	public := path == b.IssuerPath+"/.well-known/openid-configuration" || path == b.IssuerPath+"/keys" || path == b.IssuerPath+"/protocol/openid-connect/certs"
	token := path == b.IssuerPath+"/token" || path == b.IssuerPath+"/protocol/openid-connect/token"
	origin := request.Header.Get("Origin")
	if origin == "" || (!public && !token) {
		return false
	}
	if !validOrigin(origin) {
		apiError(writer, http.StatusForbidden, "invalid_origin")
		return true
	}
	if public || request.Method == http.MethodOptions {
		allowOrigin(writer, origin)
	}
	if request.Method != http.MethodOptions {
		return false
	}
	// Preflight carries no client credentials. The actual token request below
	// must still pass the current client's webOrigins policy before reaching Dex.
	writer.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
	writer.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
	writer.WriteHeader(http.StatusNoContent)
	return true
}

func (m *Management) tokenOrigin(writer http.ResponseWriter, request *http.Request) bool {
	origin := request.Header.Get("Origin")
	if origin == "" {
		return true
	}
	// Same-origin pages do not need a cross-origin grant. Keep ordinary token
	// errors readable on the two configured issuers, including unknown clients.
	if origin == "https://"+request.Host && (request.Host == m.PublicHost || request.Host == m.AdminHost) {
		allowOrigin(writer, origin)
		return true
	}
	id := request.Form.Get("client_id")
	if username, _, ok := request.BasicAuth(); ok {
		id = username
	}
	client, _, err := m.Clients.PublishedClient(request.Context(), "uds", id)
	allowed := false
	if err == nil && client.Enabled() && validOrigin(origin) {
		for _, configured := range stringsField(client.Data, "webOrigins") {
			allowed = allowed || configured == origin || configured == "*"
			if configured == "+" {
				for _, redirect := range stringsField(client.Data, "redirectUris") {
					parsed, err := url.Parse(redirect)
					allowed = allowed || (err == nil && parsed.User == nil && parsed.Scheme+"://"+parsed.Host == origin)
				}
			}
		}
	}
	if !allowed {
		apiError(writer, http.StatusForbidden, "origin_not_allowed")
		return false
	}
	allowOrigin(writer, origin)
	return true
}

// Match the pinned Dex redirect contract before collecting credentials. Dex
// repeats this check when creating the authorization request and exchanging it.
func validClientRedirect(client ClientRecord, redirect string) bool {
	registered := stringsField(client.Data, "redirectUris")
	if slices.Contains(registered, redirect) {
		return true
	}
	if !client.Public() || len(registered) != 0 {
		return false
	}
	if redirect == "urn:ietf:wg:oauth:2.0:oob" || redirect == "/device/callback" {
		return true
	}
	parsed, err := url.Parse(redirect)
	return err == nil && parsed.Scheme == "http" && (parsed.Hostname() == "localhost" || net.ParseIP(parsed.Hostname()).IsLoopback())
}

func (b *Bridge) protocolResponse(response *http.Response) error {
	// Dex must not widen the bridge's client-specific CORS decision.
	for name := range response.Header {
		if strings.HasPrefix(strings.ToLower(name), "access-control-") {
			response.Header.Del(name)
		}
	}
	if response.Request.URL.Path != b.IssuerPath+"/.well-known/openid-configuration" || response.StatusCode != http.StatusOK {
		return nil
	}
	defer response.Body.Close()
	var document map[string]any
	if err := json.NewDecoder(io.LimitReader(response.Body, 1024*1024)).Decode(&document); err != nil {
		return fmt.Errorf("invalid Dex discovery: %w", err)
	}
	for field, suffix := range map[string]string{"authorization_endpoint": "auth", "token_endpoint": "token", "userinfo_endpoint": "userinfo", "jwks_uri": "certs"} {
		document[field] = "https://" + b.PublicHost + b.IssuerPath + "/protocol/openid-connect/" + suffix
	}
	raw, err := json.Marshal(document)
	if err != nil {
		return err
	}
	response.Body = io.NopCloser(bytes.NewReader(raw))
	response.ContentLength = int64(len(raw))
	response.Header.Set("Content-Length", strconv.Itoa(len(raw)))
	response.Header.Del("Content-Encoding")
	return nil
}
