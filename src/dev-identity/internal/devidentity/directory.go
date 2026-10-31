// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package devidentity

import (
	"bytes"
	"context"
	"fmt"
	"strings"
	"sync"

	"golang.org/x/crypto/bcrypt"
)

// The directory authenticates real configured credentials. Dex consumes the
// resulting identity through its authproxy connector and signs the OIDC token.
// No request-supplied identity or group headers become directory authority.
type User struct {
	ID             string   `json:"id"`
	Username       string   `json:"username"`
	Email          string   `json:"email"`
	Name           string   `json:"name"`
	PasswordHash   []byte   `json:"passwordHash"`
	Groups         []string `json:"groups"`
	Enabled        bool     `json:"enabled"`
	Realm          string   `json:"realm,omitempty"`
	EmailVerified  bool     `json:"emailVerified,omitempty"`
	SessionVersion uint64   `json:"sessionVersion,omitempty"`
}

type ManagedDirectory interface {
	Directory
	List(context.Context) ([]User, error)
	Save(context.Context, User) error
	Delete(context.Context, string) error
}

type Directory interface {
	Authenticate(context.Context, string, string) (User, error)
	Get(context.Context, string) (User, error)
}

type MemoryDirectory struct {
	mu    sync.RWMutex
	users map[string]User
}

func NewMemoryDirectory(users []User) *MemoryDirectory {
	directory := &MemoryDirectory{users: map[string]User{}}
	for _, user := range users {
		directory.users[user.ID] = cloneUser(user)
	}
	return directory
}

func cloneUser(user User) User {
	user.Groups = append([]string(nil), user.Groups...)
	user.PasswordHash = append([]byte(nil), user.PasswordHash...)
	return user
}

func (d *MemoryDirectory) Authenticate(ctx context.Context, username, password string) (User, error) {
	if err := ctx.Err(); err != nil {
		return User{}, err
	}
	d.mu.RLock()
	defer d.mu.RUnlock()
	for _, user := range d.users {
		if user.Enabled && (user.Realm == "" || user.Realm == "uds") && (strings.EqualFold(user.Username, username) || strings.EqualFold(user.Email, username)) {
			if bcrypt.CompareHashAndPassword(user.PasswordHash, []byte(password)) == nil {
				return cloneUser(user), nil
			}
		}
	}
	return User{}, fmt.Errorf("invalid credentials")
}

func (d *MemoryDirectory) List(ctx context.Context) ([]User, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	d.mu.RLock()
	defer d.mu.RUnlock()
	users := make([]User, 0, len(d.users))
	for _, user := range d.users {
		users = append(users, cloneUser(user))
	}
	return users, nil
}

func (d *MemoryDirectory) Save(ctx context.Context, user User) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	if user.ID == "" || user.Username == "" {
		return fmt.Errorf("user identity is required")
	}
	d.mu.Lock()
	defer d.mu.Unlock()
	if old, exists := d.users[user.ID]; exists {
		user = preserveSessionVersion(old, user)
	}
	d.users[user.ID] = cloneUser(user)
	return nil
}

func preserveSessionVersion(old, user User) User {
	if user.SessionVersion < old.SessionVersion {
		user.SessionVersion = old.SessionVersion
	}
	if (old.Enabled && !user.Enabled) || !bytes.Equal(old.PasswordHash, user.PasswordHash) {
		user.SessionVersion = old.SessionVersion + 1
	}
	return user
}

func (d *MemoryDirectory) Delete(ctx context.Context, id string) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	d.mu.Lock()
	defer d.mu.Unlock()
	delete(d.users, id)
	return nil
}

func (d *MemoryDirectory) Get(ctx context.Context, id string) (User, error) {
	if err := ctx.Err(); err != nil {
		return User{}, err
	}
	d.mu.RLock()
	defer d.mu.RUnlock()
	user, ok := d.users[id]
	if !ok || !user.Enabled {
		return User{}, fmt.Errorf("identity is unavailable")
	}
	return cloneUser(user), nil
}
