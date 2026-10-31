// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package sso

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/url"
	"strings"
	"testing"
)

func tokenTransportFixture(t *testing.T, assertionStatus int) *[]url.Values {
	t.Helper()
	previousHTTP, previousGetter := managementHTTPClient, operatorSecretGetter
	t.Cleanup(func() { managementHTTPClient, operatorSecretGetter = previousHTTP, previousGetter })
	operatorSecretGetter = func(context.Context) (string, error) { return "operator-secret", nil }
	forms := []url.Values{}
	managementHTTPClient = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		if err := r.ParseForm(); err != nil {
			t.Fatal(err)
		}
		forms = append(forms, r.Form)
		status := http.StatusOK
		if r.Form.Get("client_assertion") != "" {
			status = assertionStatus
		} else if r.Form.Get("client_id") != "uds-operator" || r.Form.Get("client_secret") != "operator-secret" {
			t.Fatal("request omitted the configured client-secret identity")
		}
		return &http.Response{StatusCode: status, Body: io.NopCloser(strings.NewReader(`{"access_token":"token","expires_in":60}`))}, nil
	})}
	return &forms
}

func TestDefaultTokenModesDoNotReadProjectedCredentials(t *testing.T) {
	for _, mode := range []string{"", "unknown", "CLIENT_SECRET"} {
		t.Run(mode, func(t *testing.T) {
			forms := tokenTransportFixture(t, http.StatusUnauthorized)
			response, err := requestOperatorToken(context.Background(), mode, func() ([]byte, error) {
				t.Fatal("default client-secret mode read a projected credential")
				return []byte("available-assertion"), nil
			})
			if err != nil {
				t.Fatal(err)
			}
			response.Body.Close()
			if response.StatusCode != http.StatusOK || len(*forms) != 1 || (*forms)[0].Has("client_assertion_type") {
				t.Fatal("default authentication tried an assertion or omitted the client secret")
			}
		})
	}
}

func TestExplicitTokenModesRetainTheirFallbackBoundary(t *testing.T) {
	for _, test := range []struct {
		name, mode string
		readError  error
		status     int
		requests   int
		wantError  bool
	}{
		{"AUTO authentication rejection", "AUTO", nil, http.StatusUnauthorized, 2, false},
		{"AUTO server failure", "AUTO", nil, http.StatusInternalServerError, 1, false},
		{"AUTO unavailable assertion", "AUTO", errors.New("unavailable"), http.StatusOK, 1, false},
		{"SIGNED_JWT authentication rejection", "SIGNED_JWT", nil, http.StatusUnauthorized, 1, false},
		{"SIGNED_JWT unavailable assertion", "SIGNED_JWT", errors.New("unavailable"), http.StatusOK, 0, true},
	} {
		t.Run(test.name, func(t *testing.T) {
			forms := tokenTransportFixture(t, test.status)
			response, err := requestOperatorToken(context.Background(), test.mode, func() ([]byte, error) { return []byte("assertion"), test.readError })
			if response != nil {
				response.Body.Close()
			}
			if (err != nil) != test.wantError || len(*forms) != test.requests {
				t.Fatalf("mode crossed its authentication boundary: requests=%d error=%v", len(*forms), err)
			}
			if test.readError == nil && (*forms)[0].Get("client_assertion") != "assertion" {
				t.Fatal("explicit assertion mode did not use the supplied assertion")
			}
		})
	}
}
