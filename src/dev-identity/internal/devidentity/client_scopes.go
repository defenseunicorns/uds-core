// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package devidentity

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
)

func interactiveDefaults(data map[string]any) ([]string, error) {
	defaults := []string{"profile", "email", "groups"}
	if value, exists := data["defaultClientScopes"]; exists && value != nil {
		raw, err := json.Marshal(value)
		if err != nil || json.Unmarshal(raw, &defaults) != nil {
			return nil, fmt.Errorf("invalid default client scopes")
		}
	}
	for _, scope := range defaults {
		if scope != "profile" && scope != "email" && scope != "groups" && scope != "offline_access" {
			return nil, fmt.Errorf("unsupported default client scope")
		}
	}
	return defaults, nil
}

// Preserve Keycloak's managed default profile claims and ordinary session
// refresh. Dex requires offline_access for refresh issuance; the deployment
// caps it at an eight-hour absolute lifetime with a thirty-minute idle limit.
func (m *Management) InteractiveScopes(ctx context.Context, clientID, requested string) (string, error) {
	if err := rejectReservedGrantScopes(requested); err != nil {
		return "", err
	}
	client, snapshot, err := m.Clients.PublishedClient(ctx, "uds", clientID)
	if err != nil || !client.Enabled() || client.Data["standardFlowEnabled"] == false {
		return "", fmt.Errorf("interactive client unavailable")
	}
	if err := m.validatePublishedCorePair(ctx, client); err != nil {
		return "", err
	}
	defaults, err := interactiveDefaults(client.Data)
	if err != nil {
		return "", err
	}
	scopes := []string{}
	seen := map[string]bool{}
	for _, scope := range append(append(strings.Fields(requested), defaults...), "offline_access") {
		if !seen[scope] {
			scopes, seen[scope] = append(scopes, scope), true
		}
	}
	for _, target := range publicAudienceTargets(client.Data) {
		scope := "audience:server:client_id:" + target
		if !seen[scope] {
			scopes = append(scopes, scope)
			seen[scope] = true
		}
	}
	generation, err := clientGeneration(client, snapshot)
	if err != nil {
		return "", err
	}
	if generation != "" {
		scopes = append(scopes, clientGenerationScopePrefix+generation)
	}
	return strings.Join(scopes, " "), m.Clients.requireRecordPublished(ctx, client, snapshot)
}
