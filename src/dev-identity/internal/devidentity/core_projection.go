// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package devidentity

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
)

func CanonicalClientProjection(spec Sso) map[string]any {
	raw, _ := json.Marshal(convertSsoToClient(spec))
	var data map[string]any
	_ = json.Unmarshal(raw, &data)
	return data
}
func CoreClientSpecDigest(spec Sso) string {
	raw, _ := json.Marshal(spec)
	hash := sha256.Sum256(raw)
	return hex.EncodeToString(hash[:])
}

type coreClientProjection struct {
	ID                      string                    `json:"id,omitempty"`
	ClientID                string                    `json:"clientId"`
	Name                    string                    `json:"name,omitempty"`
	Secret                  string                    `json:"secret,omitempty"`
	SamlIdpCertificate      string                    `json:"samlIdpCertificate,omitempty"`
	FullScopeAllowed        *bool                     `json:"fullScopeAllowed,omitempty"`
	RedirectUris            []string                  `json:"redirectUris,omitzero"`
	WebOrigins              []string                  `json:"webOrigins,omitzero"`
	StandardFlowEnabled     *bool                     `json:"standardFlowEnabled,omitempty"`
	ServiceAccountsEnabled  *bool                     `json:"serviceAccountsEnabled,omitempty"`
	PublicClient            *bool                     `json:"publicClient,omitempty"`
	Protocol                string                    `json:"protocol,omitempty"`
	Attributes              map[string]string         `json:"attributes,omitempty"`
	ProtocolMappers         []projectedProtocolMapper `json:"protocolMappers,omitzero"`
	DefaultClientScopes     []string                  `json:"defaultClientScopes,omitzero"`
	ClientAuthenticatorType string                    `json:"clientAuthenticatorType,omitempty"`
	Enabled                 *bool                     `json:"enabled,omitempty"`
	AlwaysDisplayInConsole  *bool                     `json:"alwaysDisplayInConsole,omitempty"`
	RootUrl                 string                    `json:"rootUrl,omitempty"`
	BaseUrl                 string                    `json:"baseUrl,omitempty"`
	AdminUrl                string                    `json:"adminUrl,omitempty"`
	Description             string                    `json:"description,omitempty"`
}

// ProtocolMapper represents a Keycloak protocol mapper.
type projectedProtocolMapper struct {
	Name            string            `json:"name"`
	Protocol        string            `json:"protocol"`
	ProtocolMapper  string            `json:"protocolMapper"`
	ConsentRequired bool              `json:"consentRequired"`
	Config          map[string]string `json:"config,omitempty"`
}

func convertSsoToClient(sso Sso) coreClientProjection {
	client := coreClientProjection{
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
		mapper := projectedProtocolMapper{
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
