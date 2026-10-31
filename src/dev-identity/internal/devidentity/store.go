// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package devidentity

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"sync"

	corev1 "k8s.io/api/core/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime/schema"
	coreclient "k8s.io/client-go/kubernetes/typed/core/v1"
	"k8s.io/client-go/util/retry"
)

// StateStore persists only the development bridge's owned data. Tokens are
// represented by digests, never their bearer values. Dex owns OIDC state.
type StateStore interface {
	Get(context.Context, string, string, any) error
	Put(context.Context, string, string, any) error
	Delete(context.Context, string, string) error
	List(context.Context, string) ([][]byte, error)
}

const stateLabel = "uds.dev/native-identity-state"

type KubeState struct{ secrets coreclient.SecretInterface }

func NewKubeState(secrets coreclient.SecretInterface) *KubeState { return &KubeState{secrets} }

func stateName(kind, key string) string {
	digest := sha256.Sum256([]byte(kind + "\x00" + key))
	return "uds-native-" + kind + "-" + hex.EncodeToString(digest[:12])
}

func (s *KubeState) Get(ctx context.Context, kind, key string, target any) error {
	secret, err := s.secrets.Get(ctx, stateName(kind, key), metav1.GetOptions{})
	if err != nil {
		return err
	}
	return json.Unmarshal(secret.Data["state.json"], target)
}

func (s *KubeState) Put(ctx context.Context, kind, key string, value any) error {
	raw, err := json.Marshal(value)
	if err != nil {
		return err
	}
	return retry.RetryOnConflict(retry.DefaultBackoff, func() error {
		secret, err := s.secrets.Get(ctx, stateName(kind, key), metav1.GetOptions{})
		if apierrors.IsNotFound(err) {
			_, err = s.secrets.Create(ctx, &corev1.Secret{ObjectMeta: metav1.ObjectMeta{Name: stateName(kind, key), Labels: map[string]string{stateLabel: kind, "app.kubernetes.io/managed-by": "uds-native-identity"}}, Data: map[string][]byte{"state.json": raw}}, metav1.CreateOptions{})
			return err
		}
		if err != nil {
			return err
		}
		secret.Data = map[string][]byte{"state.json": raw}
		_, err = s.secrets.Update(ctx, secret, metav1.UpdateOptions{})
		return err
	})
}

func (s *KubeState) Delete(ctx context.Context, kind, key string) error {
	err := s.secrets.Delete(ctx, stateName(kind, key), metav1.DeleteOptions{})
	if apierrors.IsNotFound(err) {
		return nil
	}
	return err
}

func (s *KubeState) List(ctx context.Context, kind string) ([][]byte, error) {
	secrets, err := s.secrets.List(ctx, metav1.ListOptions{LabelSelector: stateLabel + "=" + kind})
	if err != nil {
		return nil, err
	}
	items := make([][]byte, 0, len(secrets.Items))
	for _, secret := range secrets.Items {
		items = append(items, append([]byte(nil), secret.Data["state.json"]...))
	}
	return items, nil
}

type MemoryState struct {
	mu     sync.RWMutex
	values map[string][]byte
}

func NewMemoryState() *MemoryState { return &MemoryState{values: map[string][]byte{}} }
func (s *MemoryState) Get(ctx context.Context, kind, key string, value any) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	s.mu.RLock()
	defer s.mu.RUnlock()
	raw, ok := s.values[kind+"/"+key]
	if !ok {
		return apierrors.NewNotFound(schema.GroupResource{Resource: kind}, key)
	}
	return json.Unmarshal(raw, value)
}
func (s *MemoryState) Put(ctx context.Context, kind, key string, value any) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	raw, err := json.Marshal(value)
	if err != nil {
		return err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.values[kind+"/"+key] = raw
	return nil
}
func (s *MemoryState) Delete(ctx context.Context, kind, key string) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.values, kind+"/"+key)
	return nil
}
func (s *MemoryState) List(ctx context.Context, kind string) ([][]byte, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	s.mu.RLock()
	defer s.mu.RUnlock()
	result := [][]byte{}
	for key, value := range s.values {
		if len(key) > len(kind) && key[:len(kind)+1] == kind+"/" {
			result = append(result, append([]byte(nil), value...))
		}
	}
	return result, nil
}

// ReadMany maps only the requested exact keys to their owned Secret names.
// A list from another key cannot acknowledge a current publication.
func (s *KubeState) ReadMany(ctx context.Context, kind string, keys []string) (map[string][]byte, error) {
	secrets, err := s.secrets.List(ctx, metav1.ListOptions{LabelSelector: stateLabel + "=" + kind})
	if err != nil {
		return nil, err
	}
	names := map[string]string{}
	for _, key := range keys {
		names[stateName(kind, key)] = key
	}
	result := map[string][]byte{}
	for _, secret := range secrets.Items {
		if key, requested := names[secret.Name]; requested {
			result[key] = append([]byte(nil), secret.Data["state.json"]...)
		}
	}
	return result, nil
}
func (s *MemoryState) ReadMany(ctx context.Context, kind string, keys []string) (map[string][]byte, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	s.mu.RLock()
	defer s.mu.RUnlock()
	result := map[string][]byte{}
	for _, key := range keys {
		if value, found := s.values[kind+"/"+key]; found {
			result[key] = append([]byte(nil), value...)
		}
	}
	return result, nil
}
