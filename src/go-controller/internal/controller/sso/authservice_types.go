// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package sso

// AuthserviceConfig is the full authservice configuration.
type AuthserviceConfig struct {
	ListenAddress  string             `json:"listen_address"`
	ListenPort     string             `json:"listen_port"`
	LogLevel       string             `json:"log_level"`
	DefaultOIDC    *DefaultOIDCConfig `json:"default_oidc_config,omitempty"`
	Threads        int                `json:"threads"`
	AllowUnmatched bool               `json:"allow_unmatched_requests"`
	Chains         []AuthserviceChain `json:"chains"`
}

// DefaultOIDCConfig is the default OIDC configuration.
type DefaultOIDCConfig struct {
	SkipVerifyPeerCert      bool          `json:"skip_verify_peer_cert"`
	AuthorizationURI        string        `json:"authorization_uri"`
	TokenURI                string        `json:"token_uri"`
	JWKSFetcher             *JWKSFetcher  `json:"jwks_fetcher,omitempty"`
	ClientID                string        `json:"client_id"`
	ClientSecret            string        `json:"client_secret"`
	IDToken                 *IDToken      `json:"id_token,omitempty"`
	TrustedCA               string        `json:"trusted_certificate_authority,omitempty"`
	Logout                  *LogoutConfig `json:"logout,omitempty"`
	AbsoluteSessionTimeout  string        `json:"absolute_session_timeout,omitempty"`
	IdleSessionTimeout      string        `json:"idle_session_timeout,omitempty"`
	Scopes                  []string      `json:"scopes,omitempty"`
	RedisSessionStoreConfig *RedisConfig  `json:"redis_session_store_config,omitempty"`
}

// JWKSFetcher configures JWKS fetching.
type JWKSFetcher struct {
	JWKSURI               string `json:"jwks_uri"`
	PeriodicFetchInterval int    `json:"periodic_fetch_interval_sec"`
}

// IDToken configures the ID token header injection.
type IDToken struct {
	Preamble string `json:"preamble"`
	Header   string `json:"header"`
}

// RedisConfig for session store.
type RedisConfig struct {
	ServerURI string `json:"server_uri"`
}

// AuthserviceChain represents a single authservice chain.
type AuthserviceChain struct {
	Name    string              `json:"name"`
	Match   AuthserviceMatch    `json:"match"`
	Filters []AuthserviceFilter `json:"filters"`
}

// AuthserviceMatch represents the match criteria for a chain.
type AuthserviceMatch struct {
	Header string `json:"header"`
	Prefix string `json:"prefix"`
}

// AuthserviceFilter represents a filter in a chain.
type AuthserviceFilter struct {
	OIDCOverride *OIDCOverride `json:"oidc_override,omitempty"`
}

// OIDCOverride is the OIDC configuration override for a chain.
type OIDCOverride struct {
	AuthorizationURI string        `json:"authorization_uri"`
	TokenURI         string        `json:"token_uri"`
	CallbackURI      string        `json:"callback_uri"`
	ClientID         string        `json:"client_id"`
	ClientSecret     string        `json:"client_secret"`
	Scopes           []string      `json:"scopes"`
	Logout           *LogoutConfig `json:"logout,omitempty"`
	CookieNamePrefix string        `json:"cookie_name_prefix"`
}

// LogoutConfig represents logout settings.
type LogoutConfig struct {
	Path        string `json:"path"`
	RedirectURI string `json:"redirect_uri"`
}

// ReconcileAuthservice updates the authservice configuration for the package's
// SSO clients and returns the list of authservice clients for status.
