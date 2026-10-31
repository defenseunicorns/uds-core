// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package webhook

import (
	"bytes"
	"context"
	"crypto/tls"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"
	"sync"
	"sync/atomic"
	"time"

	corev1 "k8s.io/api/core/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/client-go/kubernetes"
)

const (
	activeCAAnnotation     = "uds.dev/serving-active-ca"
	previousCAAnnotation   = "uds.dev/serving-previous-ca"
	serveAfterAnnotation   = "uds.dev/serving-rotate-after"
	overlapUntilAnnotation = "uds.dev/serving-overlap-until"
	trustOverlap           = time.Minute
	trustPropagation       = 5 * time.Second
)

// ServingManager reconciles the one shared certificate and every owned webhook
// configuration. A rolling rotation publishes overlapping trust before any
// replica switches its leaf; the old root expires from the bundle afterwards.
type ServingManager struct {
	client      kubernetes.Interface
	certificate atomic.Pointer[tls.Certificate]
	ready       atomic.Bool
	registered  atomic.Bool
	now         func() time.Time
	mu          sync.Mutex
	lastCA      []byte
}

func newServingManager(ctx context.Context, client kubernetes.Interface) (*ServingManager, error) {
	secret, err := sharedServingSecret(ctx, client)
	if err != nil {
		return nil, err
	}
	pair, ca, err := decodeServingSecret(secret)
	if err != nil {
		return nil, err
	}
	manager := &ServingManager{client: client, now: time.Now, lastCA: ca}
	manager.certificate.Store(&pair)
	return manager, nil
}

func (m *ServingManager) GetCertificate(*tls.ClientHelloInfo) (*tls.Certificate, error) {
	pair := m.certificate.Load()
	if pair == nil {
		return nil, fmt.Errorf("serving certificate is unavailable")
	}
	return pair, nil
}

func (m *ServingManager) Ready(w http.ResponseWriter, r *http.Request) {
	if !m.ready.Load() {
		http.Error(w, "Admission trust is not synchronized", http.StatusServiceUnavailable)
		return
	}
	w.WriteHeader(http.StatusOK)
}

func (m *ServingManager) Run(ctx context.Context) {
	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()
	for {
		syncCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
		err := m.Synchronize(syncCtx)
		cancel()
		if err != nil && ctx.Err() == nil {
			slog.Error("Admission certificate trust reconciliation failed", "error", err)
		}
		select {
		case <-ctx.Done():
			m.ready.Store(false)
			return
		case <-ticker.C:
		}
	}
}

func (m *ServingManager) Synchronize(ctx context.Context) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	secret, err := sharedServingSecret(ctx, m.client)
	if err != nil {
		m.ready.Store(false)
		return err
	}
	pair, ca, err := decodeServingSecret(secret)
	if err != nil {
		m.ready.Store(false)
		m.certificate.Store(nil)
		return err
	}
	secret, err = m.reconcileRotation(ctx, secret, ca)
	if err != nil {
		m.ready.Store(false)
		return err
	}
	bundle := append([]byte(nil), ca...)
	previous, _ := base64.StdEncoding.DecodeString(secret.Annotations[previousCAAnnotation])
	overlapUntil, _ := strconv.ParseInt(secret.Annotations[overlapUntilAnnotation], 10, 64)
	serveAfter, _ := strconv.ParseInt(secret.Annotations[serveAfterAnnotation], 10, 64)
	if len(previous) > 0 && m.now().Unix() < overlapUntil {
		bundle = append(bundle, previous...)
	}
	if err := m.reconcileBundles(ctx, secret, bundle); err != nil {
		m.ready.Store(false)
		return err
	}
	current := m.certificate.Load()
	if len(previous) > 0 && m.now().Unix() < serveAfter {
		// An existing replica can keep serving its old leaf while trust
		// propagates. A new replica waits before joining the Service.
		if current == nil || bytes.Equal(current.Certificate[0], pair.Certificate[0]) {
			m.ready.Store(false)
		}
		return nil
	}
	m.certificate.Store(&pair)
	m.lastCA = ca
	m.ready.Store(true)
	return nil
}

func (m *ServingManager) reconcileRotation(ctx context.Context, secret *corev1.Secret, ca []byte) (*corev1.Secret, error) {
	active := base64.StdEncoding.EncodeToString(ca)
	if secret.Annotations[activeCAAnnotation] == active {
		return secret, nil
	}
	annotations := map[string]string{activeCAAnnotation: active, previousCAAnnotation: "", serveAfterAnnotation: "0", overlapUntilAnnotation: "0"}
	previous, _ := base64.StdEncoding.DecodeString(secret.Annotations[activeCAAnnotation])
	if len(previous) == 0 && !bytes.Equal(m.lastCA, ca) {
		previous = m.lastCA
	}
	if len(previous) == 0 {
		// During migration or Secret recreation, protected registrations
		// retain the API server's previous trusted root. Recover only one
		// consistent prior authority, never an ambiguous set of roots.
		var err error
		previous, err = m.registeredPreviousCA(ctx, ca)
		if err != nil {
			return nil, err
		}
	}
	if len(previous) > 0 && !bytes.Equal(previous, ca) {
		until, _ := strconv.ParseInt(secret.Annotations[overlapUntilAnnotation], 10, 64)
		if m.now().Unix() < until {
			earlier, _ := base64.StdEncoding.DecodeString(secret.Annotations[previousCAAnnotation])
			if len(earlier) > 0 && !bytes.Equal(earlier, previous) {
				previous = append(previous, earlier...)
			}
		}
		annotations[previousCAAnnotation] = base64.StdEncoding.EncodeToString(previous)
		annotations[serveAfterAnnotation] = strconv.FormatInt(m.now().Add(trustPropagation).Unix(), 10)
		annotations[overlapUntilAnnotation] = strconv.FormatInt(m.now().Add(trustOverlap).Unix(), 10)
	}
	body := map[string]interface{}{"metadata": map[string]interface{}{"resourceVersion": secret.ResourceVersion, "annotations": annotations}}
	raw, err := json.Marshal(body)
	if err != nil {
		return nil, err
	}
	return m.client.CoreV1().Secrets(servingNamespace).Patch(ctx, servingSecretName, types.MergePatchType, raw, metav1.PatchOptions{})
}

func (m *ServingManager) reconcileBundles(ctx context.Context, secret *corev1.Secret, ca []byte) error {
	complete := true
	for _, target := range []struct {
		name     string
		mutating bool
	}{{webhookConfigName, false}, {"uds-controller-pods", false}, {"uds-controller-resources", false}, {"uds-controller-pods", true}, {mutatingWebhookConfigName, true}} {
		registered, err := reconcileCABundle(ctx, m.client, target.name, target.mutating, ca, secret)
		complete = complete && registered
		if err != nil && !apierrors.IsNotFound(err) {
			m.registered.Store(false)
			return err
		}
	}
	m.registered.Store(complete)
	return nil
}
