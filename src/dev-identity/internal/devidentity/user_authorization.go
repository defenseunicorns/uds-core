// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package devidentity

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
)

func (m *Management) UserAllowed(ctx context.Context, clientID string, user User) error {
	return m.userAllowedGrant(ctx, clientID, user, nil)
}

func (m *Management) userAllowedGrant(ctx context.Context, clientID string, user User, generation *string) error {
	if !user.Enabled || (user.Realm != "" && user.Realm != "uds") {
		return fmt.Errorf("user unavailable")
	}
	client, snapshot, err := m.Clients.PublishedClient(ctx, "uds", clientID)
	if err != nil || !client.Enabled() || client.Data["standardFlowEnabled"] == false {
		return fmt.Errorf("client unavailable")
	}
	if err := m.validatePublishedCorePair(ctx, client); err != nil {
		return err
	}
	if generation != nil {
		if err := validateGrantGeneration(client, snapshot, *generation); err != nil {
			return err
		}
	}
	var attributes map[string]string
	raw, _ := json.Marshal(client.Data["attributes"])
	if err := json.Unmarshal(raw, &attributes); err != nil && string(raw) != "null" {
		return fmt.Errorf("invalid client attributes")
	}
	if attributes["uds.core.groups"] == "" {
		return m.Clients.requireRecordPublished(ctx, client, snapshot)
	}
	var required []string
	if strings.HasPrefix(strings.TrimSpace(attributes["uds.core.groups"]), "[") {
		if err := json.Unmarshal([]byte(attributes["uds.core.groups"]), &required); err != nil {
			return fmt.Errorf("invalid client group policy")
		}
	} else {
		var policy struct {
			AnyOf []string `json:"anyOf"`
		}
		decoder := json.NewDecoder(strings.NewReader(attributes["uds.core.groups"]))
		decoder.DisallowUnknownFields()
		if err := decoder.Decode(&policy); err != nil {
			return fmt.Errorf("invalid client group policy")
		}
		required = policy.AnyOf
	}
	if len(required) == 0 {
		return m.Clients.requireRecordPublished(ctx, client, snapshot)
	}
	for _, allowed := range required {
		for _, membership := range user.Groups {
			if membership == allowed {
				return m.Clients.requireRecordPublished(ctx, client, snapshot)
			}
		}
	}
	return fmt.Errorf("client group membership required")
}

// Dex checks this private mTLS endpoint at issuance and refresh. Removing a
// user/client or its required group cannot be bypassed by a previously issued
// browser session or by completing an old authorization request.
func (m *Management) UserAuthorization(writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodGet {
		writer.WriteHeader(405)
		return
	}
	if request.TLS == nil || len(request.TLS.VerifiedChains) == 0 {
		writer.WriteHeader(403)
		return
	}
	user, err := m.Directory.Get(request.Context(), request.URL.Query().Get("userId"))
	generation := request.URL.Query().Get("clientGeneration")
	if err != nil || m.userAllowedGrant(request.Context(), request.URL.Query().Get("clientId"), user, &generation) != nil {
		writer.WriteHeader(403)
		return
	}
	writer.WriteHeader(204)
}
