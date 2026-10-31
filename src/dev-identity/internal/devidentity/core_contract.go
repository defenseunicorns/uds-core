// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package devidentity

import (
	"encoding/json"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

// CorePackage is a read-only identity projection of uds.dev/v1alpha1 Package.
// It owns no operator reconciliation, CRD generation, or admission behavior.
type CorePackage struct {
	metav1.TypeMeta   `json:",inline"`
	metav1.ObjectMeta `json:"metadata,omitempty"`
	Spec              CorePackageSpec `json:"spec"`
}
type CorePackageSpec struct {
	Sso []Sso `json:"sso,omitzero"`
}

func (p *CorePackage) DeepCopy() *CorePackage {
	if p == nil {
		return nil
	}
	raw, _ := json.Marshal(p)
	var out CorePackage
	_ = json.Unmarshal(raw, &out)
	return &out
}

// These fields and their JSON tags preserve the qualified client-contract digest.
// The captured corpus verifies omission, explicit empties, and pointer defaults.
type Sso struct {
	EnableAuthserviceSelector map[string]string        `json:"enableAuthserviceSelector,omitzero"`
	SecretConfig              *SecretConfig            `json:"secretConfig,omitempty"`
	ClientID                  string                   `json:"clientId"`
	Secret                    *string                  `json:"secret,omitempty"`
	SecretName                *string                  `json:"secretName,omitempty"`
	SecretLabels              map[string]string        `json:"secretLabels,omitzero"`
	SecretAnnotations         map[string]string        `json:"secretAnnotations,omitzero"`
	SecretTemplate            map[string]string        `json:"secretTemplate,omitzero"`
	Name                      string                   `json:"name"`
	Description               *string                  `json:"description,omitempty"`
	BaseURL                   *string                  `json:"baseUrl,omitempty"`
	AdminURL                  *string                  `json:"adminUrl,omitempty"`
	Protocol                  *Protocol                `json:"protocol,omitempty"`
	Attributes                map[string]string        `json:"attributes,omitzero"`
	ProtocolMappers           []ProtocolMapper         `json:"protocolMappers,omitzero"`
	RootURL                   *string                  `json:"rootUrl,omitempty"`
	RedirectUris              []string                 `json:"redirectUris,omitzero"`
	WebOrigins                []string                 `json:"webOrigins,omitzero"`
	Enabled                   *bool                    `json:"enabled,omitempty"`
	AlwaysDisplayInConsole    *bool                    `json:"alwaysDisplayInConsole,omitempty"`
	FullScopeAllowed          *bool                    `json:"fullScopeAllowed,omitempty"`
	StandardFlowEnabled       *bool                    `json:"standardFlowEnabled,omitempty"`
	ServiceAccountsEnabled    *bool                    `json:"serviceAccountsEnabled,omitempty"`
	PublicClient              *bool                    `json:"publicClient,omitempty"`
	ClientAuthenticatorType   *ClientAuthenticatorType `json:"clientAuthenticatorType,omitempty"`
	DefaultClientScopes       []string                 `json:"defaultClientScopes,omitzero"`
	Groups                    *Groups                  `json:"groups,omitempty"`
}

type SecretConfig struct {
	Name        *string           `json:"name,omitempty"`
	Labels      map[string]string `json:"labels,omitzero"`
	Annotations map[string]string `json:"annotations,omitzero"`
	Template    map[string]string `json:"template,omitzero"`
}

type ProtocolMapper struct {
	Name            string            `json:"name"`
	Protocol        Protocol          `json:"protocol"`
	ProtocolMapper  string            `json:"protocolMapper"`
	ConsentRequired *bool             `json:"consentRequired,omitempty"`
	Config          map[string]string `json:"config,omitzero"`
}

type Groups struct {
	AnyOf []string `json:"anyOf,omitzero"`
}

type Protocol string
type ClientAuthenticatorType string

const CoreOwnerPrefix = "uds.dev/native-package-"
