// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package webhook

import (
	"bytes"
	"context"
	"crypto/x509"
	"encoding/pem"
	"fmt"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

func (m *ServingManager) registeredPreviousCA(ctx context.Context, current []byte) ([]byte, error) {
	var candidates [][]byte
	for _, name := range []string{webhookConfigName, "uds-controller-pods", "uds-controller-resources"} {
		config, err := m.client.AdmissionregistrationV1().ValidatingWebhookConfigurations().Get(ctx, name, metav1.GetOptions{})
		if apierrors.IsNotFound(err) {
			continue
		}
		if err != nil {
			return nil, err
		}
		for _, webhook := range config.Webhooks {
			candidates = append(candidates, webhook.ClientConfig.CABundle)
		}
	}
	for _, name := range []string{"uds-controller-pods", mutatingWebhookConfigName} {
		config, err := m.client.AdmissionregistrationV1().MutatingWebhookConfigurations().Get(ctx, name, metav1.GetOptions{})
		if apierrors.IsNotFound(err) {
			continue
		}
		if err != nil {
			return nil, err
		}
		for _, webhook := range config.Webhooks {
			candidates = append(candidates, webhook.ClientConfig.CABundle)
		}
	}
	var previous []byte
	for _, candidate := range candidates {
		candidate = withoutCurrentRoots(candidate, current)
		if len(candidate) == 0 {
			continue
		}
		roots := x509.NewCertPool()
		if !roots.AppendCertsFromPEM(candidate) {
			return nil, fmt.Errorf("protected webhook contains an invalid previous root")
		}
		if len(previous) > 0 && !bytes.Equal(previous, candidate) {
			return nil, fmt.Errorf("protected webhook registrations contain ambiguous previous roots")
		}
		previous = candidate
	}
	return previous, nil
}

func withoutCurrentRoots(bundle, current []byte) []byte {
	var result []byte
	for len(bundle) > 0 {
		block, rest := pem.Decode(bundle)
		if block == nil {
			if len(bytes.TrimSpace(bundle)) > 0 {
				return bundle
			}
			break
		}
		encoded := pem.EncodeToMemory(block)
		if !bytes.Contains(current, encoded) {
			result = append(result, encoded...)
		}
		bundle = rest
	}
	return result
}
