// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package sso

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"github.com/defenseunicorns/uds-core/src/go-controller/internal/controller/cabundle"
	"log/slog"
	"sort"
	"sync"

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

var authConfigMu sync.Mutex

func ReconcileAuthservice(ctx context.Context, kubeClient kubernetes.Interface, pkg *udstypes.UDSPackage, ssoClients map[string]Client) ([]udstypes.AuthserviceClient, error) {
	authConfigMu.Lock()
	defer authConfigMu.Unlock()
	coreClient := kubeClient.CoreV1()
	// Skip if no SSO clients with authservice selector
	hasAuthserviceClients := false
	for _, ssoSpec := range pkg.Spec.Sso {
		if ssoSpec.EnableAuthserviceSelector != nil {
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
		if ssoSpec.EnableAuthserviceSelector == nil {
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
	_, err = updateAuthserviceConfig(ctx, coreClient, authConfig)
	if err != nil {
		return nil, fmt.Errorf("update authservice config: %w", err)
	}
	if err := rolloutAuthservice(ctx, kubeClient); err != nil {
		return nil, err
	}

	return authserviceClients, nil
}

// PurgeAuthserviceClients removes authservice chains for clients that are no longer in the package.
func PurgeAuthserviceClients(ctx context.Context, kubeClient kubernetes.Interface, pkg *udstypes.UDSPackage) error {
	authConfigMu.Lock()
	defer authConfigMu.Unlock()
	coreClient := kubeClient.CoreV1()
	if len(pkg.Status.AuthserviceClients) == 0 {
		return nil
	}

	// Build set of current authservice client IDs
	currentIDs := make(map[string]bool)
	for _, sso := range pkg.Spec.Sso {
		if pkg.DeletionTimestamp != nil {
			break
		}
		if sso.EnableAuthserviceSelector != nil {
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
			return err
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
		// Core's original bootstrap contract uses an inactive localhost chain.
		// Authservice validates a nonempty chain set even when unmatched requests
		// are denied. This does not create any identity client or access grant.
		Chains: []AuthserviceChain{buildChain(udstypes.Sso{}, Client{
			ClientID: "placeholder", Secret: "placeholder", RedirectUris: []string{"https://localhost/login"},
		}, domain)},
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
	// Preserve the valid inactive contract after the last real chain is removed,
	// and repair empty configurations produced by earlier Go checkpoints.
	if len(cfg.Chains) == 0 {
		cfg.Chains = buildDefaultAuthserviceConfig(config.Get().Domain).Chains
	}
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
	secret, err := kubeClient.CoreV1().Secrets(authserviceNamespace).Get(ctx, authserviceSecretName, metav1.GetOptions{})
	if err != nil {
		return err
	}
	checksum := fmt.Sprintf("%x", sha256.Sum256(secret.Data[authserviceSecretKey]))
	deployment, err := kubeClient.AppsV1().Deployments(authserviceNamespace).Get(ctx, "authservice", metav1.GetOptions{})
	if err != nil {
		return err
	}
	if deployment.Spec.Template.Annotations["pepr.dev/checksum"] == checksum {
		return nil
	}
	patch, err := json.Marshal(map[string]interface{}{"metadata": map[string]interface{}{"resourceVersion": deployment.ResourceVersion}, "spec": map[string]interface{}{"template": map[string]interface{}{"metadata": map[string]interface{}{"annotations": map[string]string{"pepr.dev/checksum": checksum}}}}})
	if err != nil {
		return err
	}
	_, err = kubeClient.AppsV1().Deployments(authserviceNamespace).Patch(ctx, "authservice", types.MergePatchType, patch, metav1.PatchOptions{})
	return err
}

// UpdateGlobalConfig propagates CA/Redis changes while preserving client chains.
func UpdateGlobalConfig(ctx context.Context, client kubernetes.Interface) error {
	authConfigMu.Lock()
	defer authConfigMu.Unlock()
	if _, err := client.CoreV1().Namespaces().Get(ctx, authserviceNamespace, metav1.GetOptions{}); errors.IsNotFound(err) {
		return nil
	} else if err != nil {
		return err
	}
	cfg, err := getAuthserviceConfig(ctx, client.CoreV1())
	if err != nil {
		return err
	}
	global := config.Get()
	if cfg.DefaultOIDC == nil {
		cfg.DefaultOIDC = buildDefaultAuthserviceConfig(global.Domain).DefaultOIDC
	}
	cfg.DefaultOIDC.TrustedCA, err = cabundle.BuildContent()
	if err != nil {
		return err
	}
	if global.AuthserviceRedisUri != "" {
		cfg.DefaultOIDC.RedisSessionStoreConfig = &RedisConfig{ServerURI: global.AuthserviceRedisUri}
	} else {
		cfg.DefaultOIDC.RedisSessionStoreConfig = nil
	}
	base := fmt.Sprintf("https://sso.%s/realms/uds/protocol/openid-connect", global.Domain)
	cfg.DefaultOIDC.AuthorizationURI = base + "/auth"
	cfg.DefaultOIDC.TokenURI = base + "/token"
	if cfg.DefaultOIDC.JWKSFetcher != nil {
		cfg.DefaultOIDC.JWKSFetcher.JWKSURI = base + "/certs"
	}
	_, err = updateAuthserviceConfig(ctx, client.CoreV1(), cfg)
	if err != nil {
		return err
	}
	return rolloutAuthservice(ctx, client)
}
