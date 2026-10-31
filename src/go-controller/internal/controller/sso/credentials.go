// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

// Package sso manages Keycloak SSO clients and Authservice configuration.
package sso

import (
	"context"
	"encoding/json"

	"fmt"

	"log/slog"
	"net/http"
	"net/url"
	"strings"

	"time"

	"github.com/defenseunicorns/uds-core/src/go-controller/internal/config"

	"github.com/google/uuid"
	corev1 "k8s.io/api/core/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	corev1client "k8s.io/client-go/kubernetes/typed/core/v1"
)

func getToken(ctx context.Context) (string, error) {
	tokenMu.Lock()
	defer tokenMu.Unlock()

	if cachedToken != "" && time.Now().Before(tokenExpiry) {
		return cachedToken, nil
	}

	resp, err := requestOperatorToken(ctx, config.Get().KeycloakClientMode, readProjectedAssertion)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("identity token request failed (%d)", resp.StatusCode)
	}

	var tokenResp struct {
		AccessToken string `json:"access_token"`
		ExpiresIn   int    `json:"expires_in"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&tokenResp); err != nil {
		return "", fmt.Errorf("decode token response: %w", err)
	}

	if tokenResp.AccessToken == "" {
		return "", fmt.Errorf("identity token endpoint returned no access token")
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
func EnsureOperatorSecret(ctx context.Context, coreClient corev1client.CoreV1Interface) error {
	const (
		secretNamespace = "keycloak"
		secretName      = "keycloak-client-secrets"
		secretKey       = "uds-operator"
	)

	secret, err := coreClient.Secrets(secretNamespace).Get(ctx, secretName, metav1.GetOptions{})
	if apierrors.IsNotFound(err) {
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
			return err
		} else {
			slog.Info("Created Keycloak clients secret with operator key",
				"namespace", secretNamespace, "name", secretName)
		}
		return nil
	}
	if err != nil {
		slog.Error("Failed to get Keycloak clients secret", "error", err)
		return err
	}

	if _, ok := secret.Data[secretKey]; !ok {
		slog.Info("Keycloak clients secret exists but missing operator key, adding it",
			"namespace", secretNamespace, "name", secretName)
		if secret.Data == nil {
			secret.Data = make(map[string][]byte)
		}
		secret.Data[secretKey] = []byte(uuid.New().String())
		if _, err := coreClient.Secrets(secretNamespace).Update(ctx, secret, metav1.UpdateOptions{}); err != nil {
			return err
		} else {
			slog.Info("Updated Keycloak clients secret with operator key",
				"namespace", secretNamespace, "name", secretName)
		}
	}

	return nil
}

func getOperatorSecret(ctx context.Context) (string, error) {
	if operatorSecretGetter != nil {
		return operatorSecretGetter(ctx)
	}
	return "", fmt.Errorf("operator secret getter not initialized")
}

func InvalidateToken() {
	tokenMu.Lock()
	defer tokenMu.Unlock()
	cachedToken = ""
	tokenExpiry = time.Time{}
}

func requestManagementToken(ctx context.Context, data url.Values) (*http.Response, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, keycloakBaseURL+"/realms/uds/protocol/openid-connect/token", strings.NewReader(data.Encode()))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	return managementHTTPClient.Do(req)
}
