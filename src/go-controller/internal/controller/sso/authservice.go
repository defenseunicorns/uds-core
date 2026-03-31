// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package sso

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"sort"
	"time"

	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/client-go/kubernetes"
	corev1client "k8s.io/client-go/kubernetes/typed/core/v1"

	udstypes "github.com/defenseunicorns/uds-core/src/go-controller/api/uds/v1alpha1"
	"github.com/defenseunicorns/uds-core/src/go-controller/internal/config"
)

const (
	authserviceNamespace  = "authservice"
	authserviceSecretName = "authservice-uds"
	authserviceSecretKey  = "config.json"
)

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
	SkipVerifyPeerCert      bool         `json:"skip_verify_peer_cert"`
	AuthorizationURI        string       `json:"authorization_uri"`
	TokenURI                string       `json:"token_uri"`
	JWKSFetcher             *JWKSFetcher `json:"jwks_fetcher,omitempty"`
	ClientID                string       `json:"client_id"`
	ClientSecret            string       `json:"client_secret"`
	IDToken                 *IDToken     `json:"id_token,omitempty"`
	TrustedCA               string       `json:"trusted_certificate_authority,omitempty"`
	Logout                  *LogoutConfig `json:"logout,omitempty"`
	AbsoluteSessionTimeout  string       `json:"absolute_session_timeout,omitempty"`
	IdleSessionTimeout      string       `json:"idle_session_timeout,omitempty"`
	Scopes                  []string     `json:"scopes,omitempty"`
	RedisSessionStoreConfig *RedisConfig `json:"redis_session_store_config,omitempty"`
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
func ReconcileAuthservice(ctx context.Context, kubeClient kubernetes.Interface, pkg *udstypes.UDSPackage, ssoClients map[string]Client) ([]udstypes.AuthserviceClient, error) {
	coreClient := kubeClient.CoreV1()
	// Skip if no SSO clients with authservice selector
	hasAuthserviceClients := false
	for _, ssoSpec := range pkg.Spec.Sso {
		if len(ssoSpec.EnableAuthserviceSelector) > 0 {
			hasAuthserviceClients = true
			break
		}
	}
	if !hasAuthserviceClients {
		slog.Debug("No SSO clients with authservice selector, skipping authservice reconciliation", "package", pkg.Name)
		return nil, nil
	}

	cfg := config.Get()
	domain := cfg.Domain

	var authserviceClients []udstypes.AuthserviceClient

	// Get current authservice config
	authConfig, err := getAuthserviceConfig(ctx, coreClient)
	if err != nil {
		return nil, fmt.Errorf("get authservice config: %w", err)
	}

	// Build new chains for this package's SSO clients
	for _, ssoSpec := range pkg.Spec.Sso {
		if len(ssoSpec.EnableAuthserviceSelector) == 0 {
			continue
		}

		client, ok := ssoClients[ssoSpec.ClientID]
		if !ok {
			slog.Warn("SSO client not found for authservice", "clientId", ssoSpec.ClientID)
			continue
		}

		chain := buildChain(ssoSpec, client, domain)

		// Remove existing chain with same name, then add new one
		authConfig.Chains = removeChain(authConfig.Chains, chain.Name)
		authConfig.Chains = append(authConfig.Chains, chain)

		authserviceClients = append(authserviceClients, udstypes.AuthserviceClient{
			ClientID: ssoSpec.ClientID,
			Selector: ssoSpec.EnableAuthserviceSelector,
		})
	}

	// Sort chains by name for deterministic output
	sort.Slice(authConfig.Chains, func(i, j int) bool {
		return authConfig.Chains[i].Name < authConfig.Chains[j].Name
	})

	// Write back the config, rolling out authservice if it changed
	changed, err := updateAuthserviceConfig(ctx, coreClient, authConfig)
	if err != nil {
		return nil, fmt.Errorf("update authservice config: %w", err)
	}
	if changed {
		if err := rolloutAuthservice(ctx, kubeClient); err != nil {
			slog.Warn("Failed to rollout authservice after config update", "error", err)
		}
	}

	return authserviceClients, nil
}

// PurgeAuthserviceClients removes authservice chains for clients that are no longer in the package.
func PurgeAuthserviceClients(ctx context.Context, kubeClient kubernetes.Interface, pkg *udstypes.UDSPackage) error {
	coreClient := kubeClient.CoreV1()
	if len(pkg.Status.AuthserviceClients) == 0 {
		return nil
	}

	// Build set of current authservice client IDs
	currentIDs := make(map[string]bool)
	for _, sso := range pkg.Spec.Sso {
		if len(sso.EnableAuthserviceSelector) > 0 {
			currentIDs[sso.ClientID] = true
		}
	}

	authConfig, err := getAuthserviceConfig(ctx, coreClient)
	if err != nil {
		return fmt.Errorf("get authservice config for purge: %w", err)
	}

	changed := false
	for _, old := range pkg.Status.AuthserviceClients {
		if !currentIDs[old.ClientID] {
			slog.Info("Purging authservice chain", "clientId", old.ClientID)
			authConfig.Chains = removeChain(authConfig.Chains, old.ClientID)
			changed = true
		}
	}

	if changed {
		if _, err := updateAuthserviceConfig(ctx, coreClient, authConfig); err != nil {
			return fmt.Errorf("update authservice config after purge: %w", err)
		}
		if err := rolloutAuthservice(ctx, kubeClient); err != nil {
			slog.Warn("Failed to rollout authservice after config purge", "error", err)
		}
	}

	return nil
}

func buildChain(sso udstypes.Sso, client Client, domain string) AuthserviceChain {
	callbackURI := ""
	hostname := ""
	if len(client.RedirectUris) > 0 {
		callbackURI = client.RedirectUris[0]
		// Extract hostname from redirect URI
		parts := extractHostname(callbackURI)
		if parts != "" {
			hostname = parts
		}
	}

	return AuthserviceChain{
		Name: client.ClientID,
		Match: AuthserviceMatch{
			Header: ":authority",
			Prefix: hostname,
		},
		Filters: []AuthserviceFilter{
			{
				OIDCOverride: &OIDCOverride{
					AuthorizationURI: fmt.Sprintf("https://sso.%s/realms/%s/protocol/openid-connect/auth", domain, keycloakRealm),
					TokenURI:         fmt.Sprintf("https://sso.%s/realms/%s/protocol/openid-connect/token", domain, keycloakRealm),
					CallbackURI:      callbackURI,
					ClientID:         client.ClientID,
					ClientSecret:     client.Secret,
					Scopes:           []string{},
					Logout: &LogoutConfig{
						Path:        "/logout",
						RedirectURI: fmt.Sprintf("https://sso.%s/realms/%s/protocol/openid-connect/logout", domain, keycloakRealm),
					},
					CookieNamePrefix: client.ClientID,
				},
			},
		},
	}
}

func extractHostname(uri string) string {
	// Extract hostname from "https://host.domain/path"
	uri = trimPrefix(uri, "https://")
	uri = trimPrefix(uri, "http://")
	if idx := indexByte(uri, '/'); idx >= 0 {
		uri = uri[:idx]
	}
	if idx := indexByte(uri, ':'); idx >= 0 {
		uri = uri[:idx]
	}
	return uri
}

func trimPrefix(s, prefix string) string {
	if len(s) >= len(prefix) && s[:len(prefix)] == prefix {
		return s[len(prefix):]
	}
	return s
}

func indexByte(s string, c byte) int {
	for i := 0; i < len(s); i++ {
		if s[i] == c {
			return i
		}
	}
	return -1
}

func removeChain(chains []AuthserviceChain, name string) []AuthserviceChain {
	var result []AuthserviceChain
	for _, c := range chains {
		if c.Name != name {
			result = append(result, c)
		}
	}
	return result
}

func buildDefaultAuthserviceConfig(domain string) *AuthserviceConfig {
	realm := "uds"
	ssoBase := fmt.Sprintf("https://sso.%s/realms/%s/protocol/openid-connect", domain, realm)
	return &AuthserviceConfig{
		ListenAddress:  "0.0.0.0",
		ListenPort:     "10003",
		LogLevel:       "info",
		Threads:        8,
		AllowUnmatched: false,
		DefaultOIDC: &DefaultOIDCConfig{
			SkipVerifyPeerCert: false,
			AuthorizationURI:   ssoBase + "/auth",
			TokenURI:           ssoBase + "/token",
			JWKSFetcher: &JWKSFetcher{
				JWKSURI:               ssoBase + "/certs",
				PeriodicFetchInterval: 60,
			},
			ClientID:     "global_id",
			ClientSecret: "global_secret",
			IDToken: &IDToken{
				Preamble: "Bearer",
				Header:   "Authorization",
			},
			Logout: &LogoutConfig{
				Path:        "/globallogout",
				RedirectURI: ssoBase + "/token/logout",
			},
			AbsoluteSessionTimeout: "0",
			IdleSessionTimeout:     "0",
			Scopes:                 []string{},
		},
		Chains: []AuthserviceChain{},
	}
}

func getAuthserviceConfig(ctx context.Context, coreClient corev1client.CoreV1Interface) (*AuthserviceConfig, error) {
	secret, err := coreClient.Secrets(authserviceNamespace).Get(ctx, authserviceSecretName, metav1.GetOptions{})
	if errors.IsNotFound(err) {
		cfg := config.Get()
		return buildDefaultAuthserviceConfig(cfg.Domain), nil
	}
	if err != nil {
		return nil, err
	}

	data, ok := secret.Data[authserviceSecretKey]
	if !ok {
		return nil, fmt.Errorf("authservice secret missing key %s", authserviceSecretKey)
	}

	var cfg AuthserviceConfig
	if err := json.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("unmarshal authservice config: %w", err)
	}
	return &cfg, nil
}

// updateAuthserviceConfig writes the config back to the secret and returns whether the content changed.
func updateAuthserviceConfig(ctx context.Context, coreClient corev1client.CoreV1Interface, cfg *AuthserviceConfig) (bool, error) {
	data, err := json.Marshal(cfg)
	if err != nil {
		return false, fmt.Errorf("marshal authservice config: %w", err)
	}

	secret, err := coreClient.Secrets(authserviceNamespace).Get(ctx, authserviceSecretName, metav1.GetOptions{})
	if errors.IsNotFound(err) {
		secret = &corev1.Secret{
			ObjectMeta: metav1.ObjectMeta{
				Name:      authserviceSecretName,
				Namespace: authserviceNamespace,
			},
			Data: map[string][]byte{
				authserviceSecretKey: data,
			},
		}
		_, err = coreClient.Secrets(authserviceNamespace).Create(ctx, secret, metav1.CreateOptions{})
		return err == nil, err
	}
	if err != nil {
		return false, err
	}

	if bytes.Equal(secret.Data[authserviceSecretKey], data) {
		return false, nil
	}

	secret.Data[authserviceSecretKey] = data
	_, err = coreClient.Secrets(authserviceNamespace).Update(ctx, secret, metav1.UpdateOptions{})
	return err == nil, err
}

// rolloutAuthservice triggers a rolling restart of the authservice deployment by
// annotating the pod template, so it picks up the updated config secret.
func rolloutAuthservice(ctx context.Context, kubeClient kubernetes.Interface) error {
	patch := fmt.Sprintf(`{"spec":{"template":{"metadata":{"annotations":{"kubectl.kubernetes.io/restartedAt":%q}}}}}`,
		time.Now().UTC().Format(time.RFC3339))
	_, err := kubeClient.AppsV1().Deployments(authserviceNamespace).Patch(
		ctx, "authservice", types.MergePatchType, []byte(patch), metav1.PatchOptions{},
	)
	if err != nil {
		return fmt.Errorf("patch authservice deployment: %w", err)
	}
	slog.Info("Triggered authservice rollout after config update")
	return nil
}
