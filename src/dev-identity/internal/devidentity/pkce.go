// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package devidentity

import (
	"context"
	"fmt"
	"net/http"
	"regexp"
)

var pkceValue = regexp.MustCompile(`^[A-Za-z0-9._~-]{43,128}$`)
var pkceChallenge = regexp.MustCompile(`^[A-Za-z0-9_-]{43}$`)

func pkceRequired(client ClientRecord) bool {
	return client.Public() || clientAttributes(client)["pkce.code.challenge.method"] == "S256"
}

func clientAttributes(client ClientRecord) map[string]string {
	values := map[string]string{}
	switch raw := client.Data["attributes"].(type) {
	case map[string]string:
		for key, value := range raw {
			values[key] = value
		}
		return values
	case map[string]any:
		for key, value := range raw {
			if text, ok := value.(string); ok {
				values[key] = text
			}
		}
	}
	return values
}

func (m *Management) checkPKCEAuth(ctx context.Context, request *http.Request) error {
	if err := rejectReservedGrantScopes(request.URL.Query().Get("scope")); err != nil {
		return err
	}
	client, _, err := m.Clients.PublishedClient(ctx, "uds", request.URL.Query().Get("client_id"))
	if err != nil {
		return err
	}
	if err := m.validatePublishedCorePair(ctx, client); err != nil {
		return err
	}
	if len(request.URL.Query()["redirect_uri"]) != 1 || !validClientRedirect(client, request.URL.Query().Get("redirect_uri")) {
		return fmt.Errorf("unregistered redirect URI")
	}
	if !pkceRequired(client) {
		return nil
	}
	query := request.URL.Query()
	if len(query["code_challenge"]) != 1 || len(query["code_challenge_method"]) != 1 || clientAttributes(client)["pkce.code.challenge.method"] != "S256" || query.Get("code_challenge_method") != "S256" ||
		!pkceChallenge.MatchString(query.Get("code_challenge")) || query.Get("response_type") != "code" {
		return fmt.Errorf("required S256 authorization-code PKCE missing")
	}
	return nil
}

func (m *Management) checkPKCEToken(ctx context.Context, request *http.Request) error {
	if err := rejectReservedGrantScopes(request.Form.Get("scope")); err != nil {
		return err
	}
	id := request.Form.Get("client_id")
	if username, _, ok := request.BasicAuth(); ok {
		id = username
	}
	client, _, err := m.Clients.PublishedClient(ctx, "uds", id)
	if err != nil {
		return err
	}
	if err := m.validatePublishedCorePair(ctx, client); err != nil {
		return err
	}
	if !pkceRequired(client) {
		return nil
	}
	if clientAttributes(client)["pkce.code.challenge.method"] != "S256" {
		return fmt.Errorf("public interactive client requires S256")
	}
	if request.Form.Get("grant_type") == "authorization_code" && (len(request.Form["code_verifier"]) != 1 || !pkceValue.MatchString(request.Form.Get("code_verifier"))) {
		return fmt.Errorf("required S256 code verifier missing")
	}
	return nil
}
