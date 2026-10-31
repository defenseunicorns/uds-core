// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

// Package sso manages Keycloak SSO clients and Authservice configuration.
package sso

// Client represents a Keycloak client representation (subset of fields).
type Client struct {
	ID                      string            `json:"id,omitempty"`
	ClientID                string            `json:"clientId"`
	Name                    string            `json:"name,omitempty"`
	Secret                  string            `json:"secret,omitempty"`
	SamlIdpCertificate      string            `json:"samlIdpCertificate,omitempty"`
	FullScopeAllowed        *bool             `json:"fullScopeAllowed,omitempty"`
	RedirectUris            []string          `json:"redirectUris,omitzero"`
	WebOrigins              []string          `json:"webOrigins,omitzero"`
	StandardFlowEnabled     *bool             `json:"standardFlowEnabled,omitempty"`
	ServiceAccountsEnabled  *bool             `json:"serviceAccountsEnabled,omitempty"`
	PublicClient            *bool             `json:"publicClient,omitempty"`
	Protocol                string            `json:"protocol,omitempty"`
	Attributes              map[string]string `json:"attributes,omitempty"`
	ProtocolMappers         []ProtocolMapper  `json:"protocolMappers,omitzero"`
	DefaultClientScopes     []string          `json:"defaultClientScopes,omitzero"`
	ClientAuthenticatorType string            `json:"clientAuthenticatorType,omitempty"`
	Enabled                 *bool             `json:"enabled,omitempty"`
	AlwaysDisplayInConsole  *bool             `json:"alwaysDisplayInConsole,omitempty"`
	RootUrl                 string            `json:"rootUrl,omitempty"`
	BaseUrl                 string            `json:"baseUrl,omitempty"`
	AdminUrl                string            `json:"adminUrl,omitempty"`
	Description             string            `json:"description,omitempty"`
}

// ProtocolMapper represents a Keycloak protocol mapper.
type ProtocolMapper struct {
	Name            string            `json:"name"`
	Protocol        string            `json:"protocol"`
	ProtocolMapper  string            `json:"protocolMapper"`
	ConsentRequired bool              `json:"consentRequired"`
	Config          map[string]string `json:"config,omitempty"`
}
