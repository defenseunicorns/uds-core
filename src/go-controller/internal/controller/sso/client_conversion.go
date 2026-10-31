// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

// Package sso manages Keycloak SSO clients and Authservice configuration.
package sso

import (
	"encoding/json"

	udstypes "github.com/defenseunicorns/uds-core/src/go-controller/api/uds/v1alpha1"
)

func convertSsoToClient(sso udstypes.Sso) Client {
	client := Client{
		ClientID:         sso.ClientID,
		FullScopeAllowed: sso.FullScopeAllowed,
		Name:             sso.Name,
		RedirectUris:     sso.RedirectUris,
		WebOrigins:       sso.WebOrigins,
		Attributes:       make(map[string]string),
	}

	for key, value := range sso.Attributes {
		client.Attributes[key] = value
	}
	client.StandardFlowEnabled = sso.StandardFlowEnabled
	client.ServiceAccountsEnabled = sso.ServiceAccountsEnabled
	client.PublicClient = sso.PublicClient
	if sso.Protocol != nil {
		client.Protocol = string(*sso.Protocol)
	} else {
		client.Protocol = "openid-connect"
	}
	if sso.ClientAuthenticatorType != nil {
		client.ClientAuthenticatorType = string(*sso.ClientAuthenticatorType)
	}
	if sso.Enabled != nil {
		client.Enabled = sso.Enabled
	}
	if sso.AlwaysDisplayInConsole != nil {
		client.AlwaysDisplayInConsole = sso.AlwaysDisplayInConsole
	}
	if sso.RootURL != nil {
		client.RootUrl = *sso.RootURL
	}
	if sso.BaseURL != nil {
		client.BaseUrl = *sso.BaseURL
	}
	if sso.AdminURL != nil {
		client.AdminUrl = *sso.AdminURL
	}
	if sso.Description != nil {
		client.Description = *sso.Description
	}
	if sso.DefaultClientScopes != nil {
		client.DefaultClientScopes = sso.DefaultClientScopes
	}
	if sso.Secret != nil {
		client.Secret = *sso.Secret
	}

	// Ensure attributes map exists and set defaults
	if client.Attributes == nil {
		client.Attributes = make(map[string]string)
	}
	// Mirror Pepr behavior: default logout.confirmation.enabled to "true"
	// unless the user has already specified it.
	if _, ok := client.Attributes["logout.confirmation.enabled"]; !ok {
		client.Attributes["logout.confirmation.enabled"] = "true"
	}
	// Mirror Pepr behavior: encode groups into uds.core.groups attribute.
	if sso.Groups != nil && len(sso.Groups.AnyOf) > 0 {
		groupsJSON, _ := json.Marshal(sso.Groups)
		client.Attributes["uds.core.groups"] = string(groupsJSON)
	} else {
		client.Attributes["uds.core.groups"] = ""
	}

	for _, pm := range sso.ProtocolMappers {
		mapper := ProtocolMapper{
			Name:           pm.Name,
			Protocol:       string(pm.Protocol),
			ProtocolMapper: pm.ProtocolMapper,
			Config:         pm.Config,
		}
		if pm.ConsentRequired != nil {
			mapper.ConsentRequired = *pm.ConsentRequired
		}
		client.ProtocolMappers = append(client.ProtocolMappers, mapper)
	}

	return client
}
