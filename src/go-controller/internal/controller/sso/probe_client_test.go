// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package sso

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"

	udstypes "github.com/defenseunicorns/uds-core/src/go-controller/api/uds/v1alpha1"
	"k8s.io/utils/ptr"
)

func TestProbeClientAlwaysUsesConfidentialServiceAccountCredentials(t *testing.T) {
	for _, existing := range []bool{false, true} {
		name := "create"
		if existing {
			name = "repair public provider default"
		}
		t.Run(name, func(t *testing.T) {
			previous := managementHTTPClient
			t.Cleanup(func() { managementHTTPClient = previous; InvalidateToken() })
			tokenMu.Lock()
			cachedToken, tokenExpiry = "unit-token", time.Now().Add(time.Hour)
			tokenMu.Unlock()
			var stored *Client
			if existing {
				stored = &Client{ID: "provider-id", ClientID: "portal-probe", PublicClient: ptr.To(true)}
			}
			writes := 0
			managementHTTPClient = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
				if r.Method == http.MethodGet {
					clients := []Client{}
					if stored != nil {
						clients = append(clients, *stored)
					}
					data, _ := json.Marshal(clients)
					return &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(strings.NewReader(string(data)))}, nil
				}
				var desired Client
				if err := json.NewDecoder(r.Body).Decode(&desired); err != nil {
					t.Fatal(err)
				}
				if desired.PublicClient == nil || *desired.PublicClient || !ptr.Deref(desired.ServiceAccountsEnabled, false) || ptr.Deref(desired.StandardFlowEnabled, true) {
					t.Fatal("probe request did not explicitly select confidential service-account authentication")
				}
				writes++
				desired.ID, desired.Secret = "provider-id", "provider-generated-secret"
				stored = &desired
				status := http.StatusNoContent
				if r.Method == http.MethodPost {
					status = http.StatusCreated
				}
				return &http.Response{StatusCode: status, Body: io.NopCloser(strings.NewReader(""))}, nil
			})}
			for range 2 {
				client, err := ReconcileProbeClient(context.Background(), udstypes.Sso{ClientID: "portal", Name: "Portal"})
				if err != nil || client.Secret != "provider-generated-secret" || ptr.Deref(client.PublicClient, true) {
					t.Fatalf("probe did not retain provider credentials: %v", err)
				}
			}
			if writes != 1 {
				t.Fatalf("stable probe credentials required %d provider writes", writes)
			}
		})
	}
}
