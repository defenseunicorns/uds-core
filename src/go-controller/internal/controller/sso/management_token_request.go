// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package sso

import (
	"context"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"strings"
)

func readProjectedAssertion() ([]byte, error) {
	return os.ReadFile("/var/run/secrets/keycloak/token")
}

// Projected assertions require an explicit mode. Missing configuration follows
// Core's verified client-secret default instead of probing a different provider.
func requestOperatorToken(ctx context.Context, mode string, readAssertion func() ([]byte, error)) (*http.Response, error) {
	if mode != "AUTO" && mode != "SIGNED_JWT" {
		return requestOperatorSecretToken(ctx)
	}
	assertion, err := readAssertion()
	if err != nil {
		if mode == "SIGNED_JWT" {
			return nil, fmt.Errorf("read projected identity assertion: %w", err)
		}
		return requestOperatorSecretToken(ctx)
	}
	data := url.Values{
		"grant_type":            {"client_credentials"},
		"client_assertion_type": {"urn:ietf:params:oauth:client-assertion-type:jwt-bearer"},
		"client_assertion":      {strings.TrimSpace(string(assertion))},
	}
	response, err := requestManagementToken(ctx, data)
	if err != nil {
		return nil, err
	}
	if mode == "AUTO" && (response.StatusCode == http.StatusBadRequest || response.StatusCode == http.StatusUnauthorized || response.StatusCode == http.StatusForbidden) {
		response.Body.Close()
		return requestOperatorSecretToken(ctx)
	}
	return response, nil
}

func requestOperatorSecretToken(ctx context.Context) (*http.Response, error) {
	secret, err := getOperatorSecret(ctx)
	if err != nil {
		return nil, err
	}
	if secret == "" {
		return nil, fmt.Errorf("missing operator client secret")
	}
	return requestManagementToken(ctx, url.Values{
		"grant_type": {"client_credentials"}, "client_id": {"uds-operator"}, "client_secret": {secret},
	})
}
