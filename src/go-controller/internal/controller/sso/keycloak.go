// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

// Package sso manages Keycloak SSO clients and Authservice configuration.
package sso

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"reflect"

	"sync"
	"time"

	"k8s.io/utils/ptr"

	corev1client "k8s.io/client-go/kubernetes/typed/core/v1"

	udstypes "github.com/defenseunicorns/uds-core/src/go-controller/api/uds/v1alpha1"
	"github.com/defenseunicorns/uds-core/src/go-controller/internal/utils"
)

const (
	keycloakBaseURL = "http://keycloak-http.keycloak.svc.cluster.local:8080"
	keycloakRealm   = "uds"
)

// tokenCache caches the Keycloak access token.
var managementHTTPClient = &http.Client{Timeout: 20 * time.Second}

var (
	tokenMu     sync.Mutex
	cachedToken string
	tokenExpiry time.Time
)

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
		if err := addCoreAudienceOwner(&client, pkg); err != nil {
			return nil, err
		}

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

		if syncedClient.Protocol == "saml" {
			certificate, err := getSamlCertificate(ctx)
			if err != nil {
				return nil, err
			}
			syncedClient.SamlIdpCertificate = certificate
		}
		clients[syncedClient.ClientID] = syncedClient

		// Create K8s secret for non-public clients
		if !ptr.Deref(syncedClient.PublicClient, false) {
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
	if err := purgeOrphanSecrets(ctx, coreClient, namespace, pkgName, generation, pkg.UID); err != nil {
		return nil, err
	}

	return clients, nil
}

// PurgeSSOClients removes Keycloak clients that are no longer referenced.
func PurgeSSOClients(ctx context.Context, pkg *udstypes.UDSPackage, currentClients []string) error {
	if pkg.Status.SsoClients == nil {
		return nil
	}

	var failures []error
	currentSet := make(map[string]bool, len(currentClients))
	for _, c := range currentClients {
		currentSet[c] = true
	}

	for _, oldClient := range pkg.Status.SsoClients {
		if !currentSet[oldClient] {
			slog.Info("Purging orphaned SSO client", "clientId", oldClient)
			if err := deleteKeycloakClient(ctx, oldClient); err != nil {
				slog.Error("Failed to purge SSO client", "clientId", oldClient, "error", err)
				failures = append(failures, err)
			}
		}
	}

	return errors.Join(failures...)
}

func syncClient(ctx context.Context, client Client) (Client, error) {
	existing, err := getKeycloakClient(ctx, client.ClientID)
	if err != nil {
		return Client{}, fmt.Errorf("get client %s: %w", client.ClientID, err)
	}

	if existing != nil {
		client.ID = existing.ID
		clearRemovedCoreAudience(*existing, &client)
		if clientMatchesDesired(*existing, client) {
			return *existing, nil
		}
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

// Only fields sent by the declarative client own provider state. Omitted flow
// and scope defaults remain provider-owned; explicit empty arrays still revoke
// previously populated values. Missing/empty returned arrays are equivalent.
func clientMatchesDesired(existing, desired Client) bool {
	encode := func(client Client) map[string]interface{} {
		data, err := json.Marshal(client)
		if err != nil {
			return nil
		}
		var fields map[string]interface{}
		if json.Unmarshal(data, &fields) != nil {
			return nil
		}
		return fields
	}
	current, wanted := encode(existing), encode(desired)
	if current == nil || wanted == nil {
		return false
	}
	for key, value := range wanted {
		if key == "id" || key == "secret" || key == "samlIdpCertificate" {
			continue
		}
		actual, present := current[key]
		if !present {
			if list, ok := value.([]interface{}); ok && len(list) == 0 {
				continue
			}
			return false
		}
		if !reflect.DeepEqual(actual, value) {
			return false
		}
	}
	return true
}

// --- Keycloak API Operations ---

func getKeycloakClient(ctx context.Context, clientID string) (*Client, error) {
	token, err := getToken(ctx)
	if err != nil {
		return nil, err
	}

	reqURL := fmt.Sprintf("%s/admin/realms/%s/clients?clientId=%s", keycloakBaseURL, keycloakRealm, url.QueryEscape(clientID))
	req, _ := http.NewRequestWithContext(ctx, "GET", reqURL, nil)
	req.Header.Set("Authorization", "Bearer "+token)

	resp, err := managementHTTPClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("get client request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return nil, nil
	}
	if resp.StatusCode != http.StatusOK {
		if resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden {
			InvalidateToken()
		}
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return nil, fmt.Errorf("get client failed (%d): %s", resp.StatusCode, string(body))
	}

	var clients []Client
	if err := json.NewDecoder(resp.Body).Decode(&clients); err != nil {
		return nil, fmt.Errorf("decode clients: %w", err)
	}

	if len(clients) == 0 {
		return nil, nil
	}
	for _, client := range clients {
		if client.ClientID == clientID {
			return &client, nil
		}
	}
	return nil, nil
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

	resp, err := managementHTTPClient.Do(req)
	if err != nil {
		return Client{}, fmt.Errorf("create client request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusCreated {
		if resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden {
			InvalidateToken()
		}
		respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
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
	reqURL := fmt.Sprintf("%s/admin/realms/%s/clients/%s", keycloakBaseURL, keycloakRealm, url.PathEscape(client.ID))
	req, _ := http.NewRequestWithContext(ctx, "PUT", reqURL, bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")

	resp, err := managementHTTPClient.Do(req)
	if err != nil {
		return fmt.Errorf("update client request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusNoContent && resp.StatusCode != http.StatusOK {
		if resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden {
			InvalidateToken()
		}
		respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
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

	reqURL := fmt.Sprintf("%s/admin/realms/%s/clients/%s", keycloakBaseURL, keycloakRealm, url.PathEscape(client.ID))
	req, _ := http.NewRequestWithContext(ctx, "DELETE", reqURL, nil)
	req.Header.Set("Authorization", "Bearer "+token)

	resp, err := managementHTTPClient.Do(req)
	if err != nil {
		return fmt.Errorf("delete client request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusNoContent && resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusNotFound {
		if resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden {
			InvalidateToken()
		}
		respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return fmt.Errorf("delete client failed (%d): %s", resp.StatusCode, string(respBody))
	}
	return nil
}

// ReconcileProbeClient creates the same service-account audience mapper used
// by Core's blackbox exporter integration.
func ReconcileProbeClient(ctx context.Context, entry udstypes.Sso) (Client, error) {
	client := Client{ClientID: entry.ClientID + "-probe", Name: entry.Name + " Uptime Probe", Protocol: "openid-connect", PublicClient: ptr.To(false), StandardFlowEnabled: ptr.To(false), ServiceAccountsEnabled: ptr.To(true), FullScopeAllowed: ptr.To(false), ProtocolMappers: []ProtocolMapper{{Name: "audience", Protocol: "openid-connect", ProtocolMapper: "oidc-audience-mapper", Config: map[string]string{"included.client.audience": entry.ClientID, "access.token.claim": "true", "introspection.token.claim": "true", "id.token.claim": "false", "lightweight.claim": "false", "userinfo.token.claim": "false"}}}}
	synced, err := syncClient(ctx, client)
	if err != nil {
		return Client{}, err
	}
	if synced.Secret == "" {
		return Client{}, fmt.Errorf("probe client %s returned no secret", client.ClientID)
	}
	return synced, nil
}
