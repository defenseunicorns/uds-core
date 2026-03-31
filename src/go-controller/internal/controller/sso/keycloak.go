// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

// Package sso manages Keycloak SSO clients and Authservice configuration.
package sso

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	corev1client "k8s.io/client-go/kubernetes/typed/core/v1"

	udstypes "github.com/defenseunicorns/uds-core/src/go-controller/api/uds/v1alpha1"
	"github.com/defenseunicorns/uds-core/src/go-controller/internal/utils"
)

const (
	keycloakBaseURL = "http://keycloak-http.keycloak.svc.cluster.local:8080"
	keycloakRealm   = "uds"
)

// tokenCache caches the Keycloak access token.
var (
	tokenMu     sync.Mutex
	cachedToken string
	tokenExpiry time.Time
)

// Client represents a Keycloak client representation (subset of fields).
type Client struct {
	ID                      string            `json:"id,omitempty"`
	ClientID                string            `json:"clientId"`
	Name                    string            `json:"name,omitempty"`
	Secret                  string            `json:"secret,omitempty"`
	RedirectUris            []string          `json:"redirectUris,omitempty"`
	WebOrigins              []string          `json:"webOrigins,omitempty"`
	StandardFlowEnabled     bool              `json:"standardFlowEnabled"`
	ServiceAccountsEnabled  bool              `json:"serviceAccountsEnabled"`
	PublicClient            bool              `json:"publicClient"`
	Protocol                string            `json:"protocol,omitempty"`
	Attributes              map[string]string `json:"attributes,omitempty"`
	ProtocolMappers         []ProtocolMapper  `json:"protocolMappers,omitempty"`
	DefaultClientScopes     []string          `json:"defaultClientScopes,omitempty"`
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

// ReconcileKeycloak creates/updates Keycloak clients and returns a map of clientID->Client.
func ReconcileKeycloak(ctx context.Context, coreClient corev1client.CoreV1Interface, pkg *udstypes.UDSPackage) (map[string]Client, error) {
	pkgName := pkg.Name
	namespace := pkg.Namespace
	generation := utils.PkgGeneration(pkg)
	ownerRefs := utils.GetOwnerRef(pkg)

	clients := make(map[string]Client)

	slog.Debug("Keycloak reconcile started",
		"package", pkgName, "namespace", namespace,
		"ssoClientCount", len(pkg.Spec.Sso), "generation", generation)

	for _, ssoSpec := range pkg.Spec.Sso {
		client := convertSsoToClient(ssoSpec)

		slog.Debug("Syncing Keycloak client",
			"package", pkgName, "clientId", client.ClientID,
			"protocol", client.Protocol,
			"publicClient", client.PublicClient,
			"standardFlowEnabled", client.StandardFlowEnabled,
			"serviceAccountsEnabled", client.ServiceAccountsEnabled)

		// Create or update the client in Keycloak
		syncedClient, err := syncClient(ctx, client)
		if err != nil {
			return nil, fmt.Errorf("sync Keycloak client %s: %w", client.ClientID, err)
		}

		slog.Debug("Keycloak client synced",
			"package", pkgName, "clientId", syncedClient.ClientID,
			"keycloakId", syncedClient.ID,
			"hasSecret", syncedClient.Secret != "")

		clients[syncedClient.ClientID] = syncedClient

		// Create K8s secret for non-public clients
		if !syncedClient.PublicClient && syncedClient.Secret != "" {
			slog.Debug("Creating K8s secret for SSO client",
				"package", pkgName, "clientId", syncedClient.ClientID)
			if err := createClientSecret(ctx, coreClient, ssoSpec, syncedClient, namespace, pkgName, generation, ownerRefs); err != nil {
				return nil, fmt.Errorf("create secret for client %s: %w", syncedClient.ClientID, err)
			}
			slog.Debug("K8s secret created for SSO client",
				"package", pkgName, "clientId", syncedClient.ClientID)
		} else {
			slog.Debug("Skipping K8s secret (public client or no secret)",
				"package", pkgName, "clientId", syncedClient.ClientID,
				"publicClient", syncedClient.PublicClient)
		}
	}

	// Purge orphaned secrets
	slog.Debug("Purging orphaned SSO secrets",
		"package", pkgName, "namespace", namespace, "generation", generation)
	purgeOrphanSecrets(ctx, coreClient, namespace, pkgName, generation)

	return clients, nil
}

// PurgeSSOClients removes Keycloak clients that are no longer referenced.
func PurgeSSOClients(ctx context.Context, pkg *udstypes.UDSPackage, currentClients []string) error {
	if pkg.Status.SsoClients == nil {
		return nil
	}

	currentSet := make(map[string]bool, len(currentClients))
	for _, c := range currentClients {
		currentSet[c] = true
	}

	for _, oldClient := range pkg.Status.SsoClients {
		if !currentSet[oldClient] {
			slog.Info("Purging orphaned SSO client", "clientId", oldClient)
			if err := deleteKeycloakClient(ctx, oldClient); err != nil {
				slog.Error("Failed to purge SSO client", "clientId", oldClient, "error", err)
			}
		}
	}

	return nil
}

func convertSsoToClient(sso udstypes.Sso) Client {
	client := Client{
		ClientID:     sso.ClientID,
		Name:         sso.Name,
		RedirectUris: sso.RedirectUris,
		WebOrigins:   sso.WebOrigins,
		Attributes:   sso.Attributes,
	}

	if sso.StandardFlowEnabled != nil {
		client.StandardFlowEnabled = *sso.StandardFlowEnabled
	} else {
		client.StandardFlowEnabled = true
	}
	if sso.ServiceAccountsEnabled != nil {
		client.ServiceAccountsEnabled = *sso.ServiceAccountsEnabled
	}
	if sso.PublicClient != nil {
		client.PublicClient = *sso.PublicClient
	}
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
	if len(sso.DefaultClientScopes) > 0 {
		client.DefaultClientScopes = sso.DefaultClientScopes
	}
	if sso.Secret != nil {
		client.Secret = *sso.Secret
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

func syncClient(ctx context.Context, client Client) (Client, error) {
	existing, err := getKeycloakClient(ctx, client.ClientID)
	if err != nil {
		return Client{}, fmt.Errorf("get client %s: %w", client.ClientID, err)
	}

	if existing != nil {
		client.ID = existing.ID
		if err := updateKeycloakClient(ctx, client); err != nil {
			return Client{}, fmt.Errorf("update client %s: %w", client.ClientID, err)
		}
		// Re-fetch to get the secret
		updated, err := getKeycloakClient(ctx, client.ClientID)
		if err != nil {
			return Client{}, err
		}
		return *updated, nil
	}

	created, err := createKeycloakClient(ctx, client)
	if err != nil {
		return Client{}, fmt.Errorf("create client %s: %w", client.ClientID, err)
	}
	return created, nil
}

func createClientSecret(ctx context.Context, coreClient corev1client.CoreV1Interface, ssoSpec udstypes.Sso, client Client, namespace, pkgName, generation string, ownerRefs []metav1.OwnerReference) error {
	secretName := fmt.Sprintf("sso-client-%s", utils.SanitizeResourceName(client.ClientID))
	if ssoSpec.SecretName != nil {
		secretName = *ssoSpec.SecretName
	}
	if ssoSpec.SecretConfig != nil && ssoSpec.SecretConfig.Name != nil {
		secretName = *ssoSpec.SecretConfig.Name
	}

	labels := map[string]string{
		"uds/package":    pkgName,
		"uds/generation": generation,
	}

	// Merge additional labels
	if ssoSpec.SecretLabels != nil {
		for k, v := range ssoSpec.SecretLabels {
			labels[k] = v
		}
	}
	if ssoSpec.SecretConfig != nil {
		for k, v := range ssoSpec.SecretConfig.Labels {
			labels[k] = v
		}
	}

	annotations := make(map[string]string)
	if ssoSpec.SecretAnnotations != nil {
		for k, v := range ssoSpec.SecretAnnotations {
			annotations[k] = v
		}
	}
	if ssoSpec.SecretConfig != nil {
		for k, v := range ssoSpec.SecretConfig.Annotations {
			annotations[k] = v
		}
	}

	// Build secret data
	data := map[string][]byte{}
	if ssoSpec.SecretConfig != nil && len(ssoSpec.SecretConfig.Template) > 0 {
		// Template mode
		for key, tmpl := range ssoSpec.SecretConfig.Template {
			value := resolveTemplate(tmpl, client)
			data[key] = []byte(value)
		}
	} else if ssoSpec.SecretTemplate != nil && len(ssoSpec.SecretTemplate) > 0 {
		// Deprecated template mode
		for key, tmpl := range ssoSpec.SecretTemplate {
			value := resolveTemplate(tmpl, client)
			data[key] = []byte(value)
		}
	} else {
		// Default: store all known fields
		data["clientId"] = []byte(client.ClientID)
		data["secret"] = []byte(client.Secret)
		if client.RootUrl != "" {
			data["rootUrl"] = []byte(client.RootUrl)
		}
	}

	secret := &corev1.Secret{
		ObjectMeta: metav1.ObjectMeta{
			Name:            secretName,
			Namespace:       namespace,
			Labels:          labels,
			Annotations:     annotations,
			OwnerReferences: ownerRefs,
		},
		Data: data,
	}

	_, err := coreClient.Secrets(namespace).Get(ctx, secretName, metav1.GetOptions{})
	if errors.IsNotFound(err) {
		_, err = coreClient.Secrets(namespace).Create(ctx, secret, metav1.CreateOptions{})
	} else if err == nil {
		_, err = coreClient.Secrets(namespace).Update(ctx, secret, metav1.UpdateOptions{})
	}
	return err
}

func purgeOrphanSecrets(ctx context.Context, coreClient corev1client.CoreV1Interface, namespace, pkgName, generation string) {
	secrets, err := coreClient.Secrets(namespace).List(ctx, metav1.ListOptions{
		LabelSelector: fmt.Sprintf("uds/package=%s", pkgName),
	})
	if err != nil {
		slog.Error("Failed to list secrets for orphan purge", "error", err)
		return
	}
	for _, s := range secrets.Items {
		if s.Labels["uds/generation"] != generation {
			slog.Debug("Deleting orphaned secret", "name", s.Name, "namespace", namespace)
			if err := coreClient.Secrets(namespace).Delete(ctx, s.Name, metav1.DeleteOptions{}); err != nil {
				slog.Error("Failed to delete orphaned secret", "name", s.Name, "error", err)
			}
		}
	}
}

func resolveTemplate(tmpl string, client Client) string {
	// Simple template resolution for clientField(fieldName)
	tmpl = strings.ReplaceAll(tmpl, "clientField(clientId)", client.ClientID)
	tmpl = strings.ReplaceAll(tmpl, "clientField(secret)", client.Secret)
	tmpl = strings.ReplaceAll(tmpl, "clientField(rootUrl)", client.RootUrl)
	tmpl = strings.ReplaceAll(tmpl, "clientField(baseUrl)", client.BaseUrl)
	tmpl = strings.ReplaceAll(tmpl, "clientField(adminUrl)", client.AdminUrl)

	if strings.Contains(tmpl, "clientField(attributes).json()") {
		attrJSON, _ := json.Marshal(client.Attributes)
		tmpl = strings.ReplaceAll(tmpl, "clientField(attributes).json()", string(attrJSON))
	}

	return tmpl
}

// --- Keycloak API Operations ---

func getToken(ctx context.Context) (string, error) {
	tokenMu.Lock()
	defer tokenMu.Unlock()

	if cachedToken != "" && time.Now().Before(tokenExpiry) {
		return cachedToken, nil
	}

	// Get operator client secret from K8s
	// We need to reach the Keycloak token endpoint
	secret, err := getOperatorSecret(ctx)
	if err != nil {
		return "", fmt.Errorf("get operator secret: %w", err)
	}

	// Exchange for token
	data := url.Values{
		"grant_type":    {"client_credentials"},
		"client_id":     {"uds-operator"},
		"client_secret": {secret},
	}

	resp, err := http.PostForm(
		fmt.Sprintf("%s/realms/%s/protocol/openid-connect/token", keycloakBaseURL, keycloakRealm),
		data,
	)
	if err != nil {
		return "", fmt.Errorf("token request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("token request failed (%d): %s", resp.StatusCode, string(body))
	}

	var tokenResp struct {
		AccessToken string `json:"access_token"`
		ExpiresIn   int    `json:"expires_in"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&tokenResp); err != nil {
		return "", fmt.Errorf("decode token response: %w", err)
	}

	cachedToken = tokenResp.AccessToken
	tokenExpiry = time.Now().Add(time.Duration(tokenResp.ExpiresIn-5) * time.Second)
	return cachedToken, nil
}

// operatorSecretGetter is set by the controller during initialization.
var operatorSecretGetter func(ctx context.Context) (string, error)

// SetOperatorSecretGetter sets the function used to retrieve the Keycloak operator secret.
func SetOperatorSecretGetter(fn func(ctx context.Context) (string, error)) {
	operatorSecretGetter = fn
}

// EnsureOperatorSecret ensures the keycloak-client-secrets Secret exists with the
// uds-operator key populated. This is called during SSO reconciliation to handle
// the case where the Go controller started before the keycloak namespace existed.
func EnsureOperatorSecret(ctx context.Context, coreClient corev1client.CoreV1Interface) {
	const (
		secretNamespace = "keycloak"
		secretName      = "keycloak-client-secrets"
		secretKey       = "uds-operator"
	)

	secret, err := coreClient.Secrets(secretNamespace).Get(ctx, secretName, metav1.GetOptions{})
	if errors.IsNotFound(err) {
		slog.Info("Keycloak clients secret does not exist yet, creating it",
			"namespace", secretNamespace, "name", secretName)
		newSecret := &corev1.Secret{
			ObjectMeta: metav1.ObjectMeta{
				Name:      secretName,
				Namespace: secretNamespace,
			},
			Data: map[string][]byte{
				secretKey: []byte(uuid.New().String()),
			},
		}
		if _, err := coreClient.Secrets(secretNamespace).Create(ctx, newSecret, metav1.CreateOptions{}); err != nil {
			slog.Error("Failed to create Keycloak clients secret", "error", err)
		} else {
			slog.Info("Created Keycloak clients secret with operator key",
				"namespace", secretNamespace, "name", secretName)
		}
		return
	}
	if err != nil {
		slog.Error("Failed to get Keycloak clients secret", "error", err)
		return
	}

	if _, ok := secret.Data[secretKey]; !ok {
		slog.Info("Keycloak clients secret exists but missing operator key, adding it",
			"namespace", secretNamespace, "name", secretName)
		if secret.Data == nil {
			secret.Data = make(map[string][]byte)
		}
		secret.Data[secretKey] = []byte(uuid.New().String())
		if _, err := coreClient.Secrets(secretNamespace).Update(ctx, secret, metav1.UpdateOptions{}); err != nil {
			slog.Error("Failed to update Keycloak clients secret", "error", err)
		} else {
			slog.Info("Updated Keycloak clients secret with operator key",
				"namespace", secretNamespace, "name", secretName)
		}
	}
}

func getOperatorSecret(ctx context.Context) (string, error) {
	if operatorSecretGetter != nil {
		return operatorSecretGetter(ctx)
	}
	return "", fmt.Errorf("operator secret getter not initialized")
}

func getKeycloakClient(ctx context.Context, clientID string) (*Client, error) {
	token, err := getToken(ctx)
	if err != nil {
		return nil, err
	}

	reqURL := fmt.Sprintf("%s/admin/realms/%s/clients?clientId=%s", keycloakBaseURL, keycloakRealm, url.QueryEscape(clientID))
	req, _ := http.NewRequestWithContext(ctx, "GET", reqURL, nil)
	req.Header.Set("Authorization", "Bearer "+token)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("get client request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return nil, nil
	}
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("get client failed (%d): %s", resp.StatusCode, string(body))
	}

	var clients []Client
	if err := json.NewDecoder(resp.Body).Decode(&clients); err != nil {
		return nil, fmt.Errorf("decode clients: %w", err)
	}

	if len(clients) == 0 {
		return nil, nil
	}
	return &clients[0], nil
}

func createKeycloakClient(ctx context.Context, client Client) (Client, error) {
	token, err := getToken(ctx)
	if err != nil {
		return Client{}, err
	}

	body, _ := json.Marshal(client)
	reqURL := fmt.Sprintf("%s/admin/realms/%s/clients", keycloakBaseURL, keycloakRealm)
	req, _ := http.NewRequestWithContext(ctx, "POST", reqURL, bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return Client{}, fmt.Errorf("create client request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusCreated {
		respBody, _ := io.ReadAll(resp.Body)
		return Client{}, fmt.Errorf("create client failed (%d): %s", resp.StatusCode, string(respBody))
	}

	// Fetch the created client to get the ID and secret
	created, err := getKeycloakClient(ctx, client.ClientID)
	if err != nil || created == nil {
		return Client{}, fmt.Errorf("fetch created client %s: %w", client.ClientID, err)
	}
	return *created, nil
}

func updateKeycloakClient(ctx context.Context, client Client) error {
	token, err := getToken(ctx)
	if err != nil {
		return err
	}

	body, _ := json.Marshal(client)
	reqURL := fmt.Sprintf("%s/admin/realms/%s/clients/%s", keycloakBaseURL, keycloakRealm, client.ID)
	req, _ := http.NewRequestWithContext(ctx, "PUT", reqURL, bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return fmt.Errorf("update client request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusNoContent && resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("update client failed (%d): %s", resp.StatusCode, string(respBody))
	}
	return nil
}

func deleteKeycloakClient(ctx context.Context, clientID string) error {
	client, err := getKeycloakClient(ctx, clientID)
	if err != nil || client == nil {
		return err // Client doesn't exist, nothing to delete
	}

	token, err := getToken(ctx)
	if err != nil {
		return err
	}

	reqURL := fmt.Sprintf("%s/admin/realms/%s/clients/%s", keycloakBaseURL, keycloakRealm, client.ID)
	req, _ := http.NewRequestWithContext(ctx, "DELETE", reqURL, nil)
	req.Header.Set("Authorization", "Bearer "+token)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return fmt.Errorf("delete client request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusNoContent && resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusNotFound {
		respBody, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("delete client failed (%d): %s", resp.StatusCode, string(respBody))
	}
	return nil
}
