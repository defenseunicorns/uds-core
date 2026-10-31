// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package devidentity

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"time"
)

type session struct {
	Digest  string    `json:"digest"`
	UserID  string    `json:"userId"`
	Expires time.Time `json:"expires"`
	Scope   string    `json:"scope,omitempty"`
	Version uint64    `json:"version,omitempty"`
}
type Sessions struct {
	store StateStore
	now   func() time.Time
	scope string
}

func NewSessions() *Sessions                           { return NewPersistentSessions(NewMemoryState()) }
func NewPersistentSessions(store StateStore) *Sessions { return &Sessions{store: store, now: time.Now} }
func NewScopedPersistentSessions(store StateStore, scope string) *Sessions {
	return &Sessions{store: store, now: time.Now, scope: scope}
}

func tokenDigest(token string) string {
	key := sha256.Sum256([]byte(token))
	return hex.EncodeToString(key[:])
}

func randomToken() (string, error) {
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(raw), nil
}

func (s *Sessions) Create(userID string) (string, error) {
	return s.CreateContext(context.Background(), userID)
}

func (s *Sessions) CreateContext(ctx context.Context, userID string) (string, error) {
	return s.CreateIdentity(ctx, User{ID: userID})
}

func (s *Sessions) CreateIdentity(ctx context.Context, user User) (string, error) {
	token, err := randomToken()
	if err != nil {
		return "", err
	}
	digest := tokenDigest(token)
	if err := s.store.Put(ctx, "session", digest, session{Digest: digest, UserID: user.ID, Expires: s.now().Add(8 * time.Hour), Scope: s.scope, Version: user.SessionVersion}); err != nil {
		return "", err
	}
	return token, nil
}

func (s *Sessions) Lookup(token string) (string, bool) {
	return s.LookupContext(context.Background(), token)
}

func (s *Sessions) LookupContext(ctx context.Context, token string) (string, bool) {
	id, _, valid := s.LookupIdentity(ctx, token)
	return id, valid
}

func (s *Sessions) LookupIdentity(ctx context.Context, token string) (string, uint64, bool) {
	if len(token) != 43 {
		return "", 0, false
	}
	var entry session
	if err := s.store.Get(ctx, "session", tokenDigest(token), &entry); err != nil {
		return "", 0, false
	}
	if entry.Scope != s.scope {
		return "", 0, false
	}
	if !s.now().Before(entry.Expires) {
		_ = s.store.Delete(ctx, "session", tokenDigest(token))
		return "", 0, false
	}
	return entry.UserID, entry.Version, true
}

func (s *Sessions) Revoke(token string) { _ = s.RevokeContext(context.Background(), token) }
func (s *Sessions) RevokeContext(ctx context.Context, token string) error {
	return s.store.Delete(ctx, "session", tokenDigest(token))
}

func (s *Sessions) RevokeUser(ctx context.Context, userID string) error {
	entries, err := s.store.List(ctx, "session")
	if err != nil {
		return err
	}
	for _, raw := range entries {
		if err := ctx.Err(); err != nil {
			return err
		}
		var entry session
		if err := json.Unmarshal(raw, &entry); err != nil {
			return err
		}
		if entry.UserID == userID || !s.now().Before(entry.Expires) {
			if err := s.store.Delete(ctx, "session", entry.Digest); err != nil {
				return err
			}
		}
	}
	return nil
}
