// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package devidentity

import (
	"context"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"fmt"

	authv1 "k8s.io/api/authentication/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	authclient "k8s.io/client-go/kubernetes/typed/authentication/v1"
	coreclient "k8s.io/client-go/kubernetes/typed/core/v1"
)

type Principal struct {
	Role           string `json:"role"`
	Subject        string `json:"subject"`
	Version        string `json:"version,omitempty"`
	Namespace      string `json:"namespace,omitempty"`
	ServiceAccount string `json:"serviceAccount,omitempty"`
	Pod            string `json:"pod,omitempty"`
	PodUID         string `json:"podUID,omitempty"`
	CredentialType string `json:"credentialType,omitempty"`
}

type Authority interface {
	Admin(context.Context, string, string) (Principal, error)
	Operator(context.Context, string, string) (Principal, error)
	Assertion(context.Context, string) (Principal, error)
	Validate(context.Context, Principal) error
}

type KubeAuthority struct {
	Core                   coreclient.CoreV1Interface
	Auth                   authclient.AuthenticationV1Interface
	Namespace              string
	FleetAudience          string
	FleetClientEnabled     bool
	FleetNamespace         string
	FleetServiceAccount    string
	OperatorNamespace      string
	OperatorServiceAccount string
}

func equalSecret(left, right string) bool {
	a := sha256.Sum256([]byte(left))
	b := sha256.Sum256([]byte(right))
	return right != "" && subtle.ConstantTimeCompare(a[:], b[:]) == 1
}

func credentialVersion(username, secret string) string {
	digest := sha256.Sum256([]byte(username + "\x00" + secret))
	return hex.EncodeToString(digest[:])
}

func (a *KubeAuthority) Admin(ctx context.Context, username, password string) (Principal, error) {
	secret, err := a.Core.Secrets(a.Namespace).Get(ctx, "keycloak-admin-password", metav1.GetOptions{})
	if err != nil {
		return Principal{}, err
	}
	if !equalSecret(username, string(secret.Data["username"])) || !equalSecret(password, string(secret.Data["password"])) {
		return Principal{}, fmt.Errorf("invalid admin credentials")
	}
	return Principal{Role: "admin", Subject: username, Version: credentialVersion(username, password)}, nil
}

func (a *KubeAuthority) Operator(ctx context.Context, clientID, password string) (Principal, error) {
	if clientID != "uds-operator" {
		return Principal{}, fmt.Errorf("unauthorized management client")
	}
	secret, err := a.Core.Secrets(a.Namespace).Get(ctx, "keycloak-client-secrets", metav1.GetOptions{})
	if err != nil {
		return Principal{}, err
	}
	if !equalSecret(password, string(secret.Data[clientID])) {
		return Principal{}, fmt.Errorf("invalid client credentials")
	}
	return Principal{Role: "operator", Subject: clientID, Version: credentialVersion(clientID, password)}, nil
}

func (a *KubeAuthority) Assertion(ctx context.Context, assertion string) (Principal, error) {
	if assertion == "" || a.FleetAudience == "" {
		return Principal{}, fmt.Errorf("Fleet authorization unavailable")
	}
	review, err := a.Auth.TokenReviews().Create(ctx, &authv1.TokenReview{Spec: authv1.TokenReviewSpec{Token: assertion, Audiences: []string{a.FleetAudience}}}, metav1.CreateOptions{})
	if err != nil {
		return Principal{}, err
	}
	role, namespace, account := "fleet", a.FleetNamespace, a.FleetServiceAccount
	if a.OperatorNamespace != "" && a.OperatorServiceAccount != "" && review.Status.User.Username == "system:serviceaccount:"+a.OperatorNamespace+":"+a.OperatorServiceAccount {
		role, namespace, account = "operator", a.OperatorNamespace, a.OperatorServiceAccount
	}
	if role == "fleet" && !a.FleetClientEnabled {
		return Principal{}, fmt.Errorf("Fleet management is disabled")
	}
	expected := "system:serviceaccount:" + namespace + ":" + account
	if namespace == "" || account == "" || !review.Status.Authenticated || review.Status.User.Username != expected || review.Status.User.UID == "" {
		return Principal{}, fmt.Errorf("unauthorized Fleet assertion")
	}
	audienceOK := false
	for _, audience := range review.Status.Audiences {
		audienceOK = audienceOK || audience == a.FleetAudience
	}
	if !audienceOK {
		return Principal{}, fmt.Errorf("Fleet audience mismatch")
	}
	principal := Principal{Role: role, Subject: expected, Namespace: namespace, ServiceAccount: account, Version: review.Status.User.UID, CredentialType: "kubernetes"}
	if values := review.Status.User.Extra["authentication.kubernetes.io/pod-name"]; len(values) == 1 {
		principal.Pod = values[0]
	}
	if values := review.Status.User.Extra["authentication.kubernetes.io/pod-uid"]; len(values) == 1 {
		principal.PodUID = values[0]
	}
	if err := a.Validate(ctx, principal); err != nil {
		return Principal{}, err
	}
	return principal, nil
}

func (a *KubeAuthority) Validate(ctx context.Context, principal Principal) error {
	if principal.CredentialType == "kubernetes" {
		return a.validateBoundIdentity(ctx, principal)
	}
	switch principal.Role {
	case "admin", "operator":
		name, key := "keycloak-admin-password", "password"
		if principal.Role == "operator" {
			name, key = "keycloak-client-secrets", "uds-operator"
		}
		secret, err := a.Core.Secrets(a.Namespace).Get(ctx, name, metav1.GetOptions{})
		if err != nil {
			return err
		}
		if principal.Role == "admin" && !equalSecret(principal.Subject, string(secret.Data["username"])) {
			return fmt.Errorf("admin revoked")
		}
		if principal.Version != credentialVersion(principal.Subject, string(secret.Data[key])) {
			return fmt.Errorf("credential rotated")
		}
	default:
		return fmt.Errorf("unauthorized principal")
	}
	return nil
}

func (a *KubeAuthority) validateBoundIdentity(ctx context.Context, principal Principal) error {
	namespace, name := a.FleetNamespace, a.FleetServiceAccount
	if principal.Role == "operator" {
		namespace, name = a.OperatorNamespace, a.OperatorServiceAccount
	} else if principal.Role != "fleet" {
		return fmt.Errorf("unauthorized bound identity")
	} else if !a.FleetClientEnabled {
		return fmt.Errorf("Fleet management is disabled")
	}
	if namespace == "" || name == "" || principal.Namespace != namespace || principal.ServiceAccount != name || principal.Subject != "system:serviceaccount:"+namespace+":"+name {
		return fmt.Errorf("bound identity revoked")
	}
	account, err := a.Core.ServiceAccounts(namespace).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		return err
	}
	if string(account.UID) != principal.Version || account.DeletionTimestamp != nil {
		return fmt.Errorf("service-account replaced")
	}
	if principal.Pod != "" {
		pod, err := a.Core.Pods(namespace).Get(ctx, principal.Pod, metav1.GetOptions{})
		if err != nil {
			return err
		}
		if string(pod.UID) != principal.PodUID || pod.DeletionTimestamp != nil {
			return fmt.Errorf("bound Pod revoked")
		}
	}
	return nil
}
