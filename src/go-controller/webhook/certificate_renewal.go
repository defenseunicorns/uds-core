// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package webhook

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"encoding/base64"
	"errors"
	"fmt"
	"log/slog"
	"time"

	corev1 "k8s.io/api/core/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

var errInvalidServingIdentity = errors.New("invalid serving identity")

func (m *ServingManager) loadServingSecret(ctx context.Context) (*corev1.Secret, error) {
	secret, err := sharedServingSecret(ctx, m.client)
	if err != nil {
		return nil, err
	}
	pair, err := tls.X509KeyPair(secret.Data["tls.crt"], secret.Data["tls.key"])
	if err != nil {
		return nil, fmt.Errorf("%w: %w", errInvalidServingIdentity, err)
	}
	leaf, err := x509.ParseCertificate(pair.Certificate[0])
	if err != nil {
		return nil, fmt.Errorf("%w: %w", errInvalidServingIdentity, err)
	}
	now := m.now()
	if leaf.NotAfter.Sub(now) < 30*24*time.Hour && (m.lastExpiryWarning.IsZero() || now.Sub(m.lastExpiryWarning) >= time.Hour) {
		slog.Warn("Admission serving certificate is near expiry", "expiresAt", leaf.NotAfter, "daysRemaining", leaf.NotAfter.Sub(now).Hours()/24)
		m.lastExpiryWarning = now
	}
	renewAt := leaf.NotBefore.Add(leaf.NotAfter.Sub(leaf.NotBefore) * 2 / 3)
	if now.Before(renewAt) {
		return secret, nil
	}
	// Validate the old identity during its valid lifetime before renewing it.
	// Expiry is recoverable; a mismatched key, CA, or hostname is not authority.
	if _, _, err := decodeServingSecretAt(secret, renewAt); err != nil {
		return nil, fmt.Errorf("%w: %w", errInvalidServingIdentity, err)
	}
	certificate, ca, err := generateSelfSignedCertAt(now)
	if err != nil {
		return nil, err
	}
	key, err := privateKeyPEM(certificate)
	if err != nil {
		return nil, err
	}
	next := secret.DeepCopy()
	if next.Annotations == nil {
		next.Annotations = map[string]string{}
	}
	if next.Annotations[activeCAAnnotation] == "" {
		next.Annotations[activeCAAnnotation] = base64.StdEncoding.EncodeToString(secret.Data["ca.crt"])
	}
	next.Data = map[string][]byte{"tls.crt": ca, "tls.key": key, "ca.crt": ca}
	updated, err := m.client.CoreV1().Secrets(servingNamespace).Update(ctx, next, metav1.UpdateOptions{})
	if apierrors.IsConflict(err) {
		// Another replica renewed the shared identity. Adopt its winning object.
		return m.client.CoreV1().Secrets(servingNamespace).Get(ctx, servingSecretName, metav1.GetOptions{})
	}
	if err == nil {
		slog.Info("Renewed admission serving certificate", "previousExpiry", leaf.NotAfter)
	}
	return updated, err
}
