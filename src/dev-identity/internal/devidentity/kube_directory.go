// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package devidentity

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"golang.org/x/crypto/bcrypt"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	coreclient "k8s.io/client-go/kubernetes/typed/core/v1"
	"strings"
)

const userLabel = "uds.dev/native-identity-user"

type KubeDirectory struct{ secrets coreclient.SecretInterface }

func NewKubeDirectory(secrets coreclient.SecretInterface) *KubeDirectory {
	return &KubeDirectory{secrets: secrets}
}
func userSecretName(id string) string {
	digest := sha256.Sum256([]byte(id))
	return "uds-native-user-" + hex.EncodeToString(digest[:12])
}

func (d *KubeDirectory) Get(ctx context.Context, id string) (User, error) {
	secret, err := d.secrets.Get(ctx, userSecretName(id), metav1.GetOptions{})
	if err != nil {
		return User{}, err
	}
	var user User
	if err := json.Unmarshal(secret.Data["user.json"], &user); err != nil {
		return User{}, err
	}
	if user.ID != id || !user.Enabled {
		return User{}, fmt.Errorf("identity is unavailable")
	}
	return user, nil
}

func (d *KubeDirectory) List(ctx context.Context) ([]User, error) {
	secrets, err := d.secrets.List(ctx, metav1.ListOptions{LabelSelector: userLabel + "=true"})
	if err != nil {
		return nil, err
	}
	users := []User{}
	for _, secret := range secrets.Items {
		var user User
		if err := json.Unmarshal(secret.Data["user.json"], &user); err != nil {
			return nil, err
		}
		users = append(users, user)
	}
	return users, nil
}

func (d *KubeDirectory) Authenticate(ctx context.Context, username, password string) (User, error) {
	users, err := d.List(ctx)
	if err != nil {
		return User{}, err
	}
	for _, user := range users {
		if user.Enabled && (user.Realm == "" || user.Realm == "uds") && (strings.EqualFold(user.Username, username) || strings.EqualFold(user.Email, username)) {
			if bcrypt.CompareHashAndPassword(user.PasswordHash, []byte(password)) == nil {
				return user, nil
			}
		}
	}
	return User{}, fmt.Errorf("invalid credentials")
}

func (d *KubeDirectory) Save(ctx context.Context, user User) error {
	if user.ID == "" || user.Username == "" {
		return fmt.Errorf("user identity is required")
	}
	name := userSecretName(user.ID)
	current, err := d.secrets.Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		// Only NotFound is creation; API failures must not become overwritten state.
		if !isNotFound(err) {
			return err
		}
		raw, err := json.Marshal(user)
		if err != nil {
			return err
		}
		_, err = d.secrets.Create(ctx, &corev1.Secret{ObjectMeta: metav1.ObjectMeta{Name: name, Labels: map[string]string{userLabel: "true", "app.kubernetes.io/managed-by": "uds-native-identity"}}, Data: map[string][]byte{"user.json": raw}}, metav1.CreateOptions{})
		return err
	}
	var old User
	if err := json.Unmarshal(current.Data["user.json"], &old); err != nil {
		return err
	}
	user = preserveSessionVersion(old, user)
	raw, err := json.Marshal(user)
	if err != nil {
		return err
	}
	current.Data = map[string][]byte{"user.json": raw}
	_, err = d.secrets.Update(ctx, current, metav1.UpdateOptions{})
	return err
}

func (d *KubeDirectory) Delete(ctx context.Context, id string) error {
	err := d.secrets.Delete(ctx, userSecretName(id), metav1.DeleteOptions{})
	if isNotFound(err) {
		return nil
	}
	return err
}
