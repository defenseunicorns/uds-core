// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package devidentity

import (
	"bytes"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

type apiToken struct {
	Digest    string    `json:"digest"`
	Principal Principal `json:"principal"`
	Expires   time.Time `json:"expires"`
}

func (m *Management) authorize(request *http.Request) (Principal, error) {
	if !strings.HasPrefix(request.Header.Get("Authorization"), "Bearer ") {
		return Principal{}, fmt.Errorf("bearer API token required")
	}
	token := strings.TrimPrefix(request.Header.Get("Authorization"), "Bearer ")
	if len(token) != 43 || m.Authority == nil {
		return Principal{}, fmt.Errorf("invalid API token")
	}
	var entry apiToken
	if err := m.Store.Get(request.Context(), "apitoken", tokenDigest(token), &entry); err != nil {
		return Principal{}, err
	}
	if !m.now().Before(entry.Expires) {
		return Principal{}, fmt.Errorf("API token expired")
	}
	if err := m.Authority.Validate(request.Context(), entry.Principal); err != nil {
		return Principal{}, err
	}
	return entry.Principal, nil
}

func (m *Management) issueToken(writer http.ResponseWriter, request *http.Request, principal Principal) {
	token, err := randomToken()
	if err != nil {
		apiError(writer, 503, "temporarily_unavailable")
		return
	}
	digest := tokenDigest(token)
	if err := m.Store.Put(request.Context(), "apitoken", digest, apiToken{Digest: digest, Principal: principal, Expires: m.now().Add(5 * time.Minute)}); err != nil {
		apiError(writer, 503, "temporarily_unavailable")
		return
	}
	jsonResponse(writer, 200, map[string]any{"access_token": token, "token_type": "Bearer", "expires_in": 300, "scope": "uds-management"})
}

func (m *Management) routeToken(writer http.ResponseWriter, request *http.Request) bool {
	if request.Method != http.MethodPost {
		return false
	}
	raw, err := io.ReadAll(io.LimitReader(request.Body, 64*1024))
	if err != nil {
		apiError(writer, 400, "invalid_request")
		return true
	}
	request.Body.Close()
	request.Body = io.NopCloser(bytes.NewReader(raw))
	if err := request.ParseForm(); err != nil {
		apiError(writer, 400, "invalid_request")
		return true
	}
	if !m.tokenOrigin(writer, request) {
		return true
	}
	// Rebuild the consumed body for ordinary Dex code/refresh/device grants.
	request.Body = io.NopCloser(bytes.NewReader(raw))
	master := strings.HasPrefix(request.URL.Path, "/realms/master/")
	grant := request.Form.Get("grant_type")
	if !master && grant != "client_credentials" {
		if grant == "authorization_code" || grant == "refresh_token" {
			if err := m.checkPKCEToken(request.Context(), request); err != nil {
				apiError(writer, 400, "client_policy_denied")
				return true
			}
		}
		return false
	}
	clientID := request.Form.Get("client_id")
	if username, _, ok := request.BasicAuth(); ok {
		clientID = username
	}
	if !master && grant == "client_credentials" && request.Form.Get("client_assertion_type") == "" && clientID != "uds-operator" {
		return false
	}
	if m.Authority == nil {
		apiError(writer, 503, "temporarily_unavailable")
		return true
	}
	var principal Principal
	switch {
	case master && grant == "password" && request.Form.Get("client_id") == "admin-cli":
		principal, err = m.Authority.Admin(request.Context(), request.Form.Get("username"), request.Form.Get("password"))
	case !master && grant == "client_credentials" && request.Form.Get("client_assertion_type") == "urn:ietf:params:oauth:client-assertion-type:jwt-bearer":
		principal, err = m.Authority.Assertion(request.Context(), request.Form.Get("client_assertion"))
	case !master && grant == "client_credentials":
		clientID, secret := request.Form.Get("client_id"), request.Form.Get("client_secret")
		if username, password, ok := request.BasicAuth(); ok {
			clientID, secret = username, password
		}
		principal, err = m.Authority.Operator(request.Context(), clientID, secret)
	default:
		apiError(writer, 400, "unsupported_grant_type")
		return true
	}
	if err != nil {
		apiError(writer, 401, "invalid_client")
		return true
	}
	m.issueToken(writer, request, principal)
	return true
}
