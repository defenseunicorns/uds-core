// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package webhook

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"encoding/pem"
	"fmt"

	corev1 "k8s.io/api/core/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
)

const servingSecretName = "uds-controller-serving-certificate"
const servingNamespace = "uds-system"

// A create race returns the winning Secret. Each replica must serve the same
// certificate rather than replacing the shared webhook trust bundle with its
// own process-local certificate at startup.
func sharedServingCertificate(ctx context.Context, client kubernetes.Interface) (tls.Certificate, []byte, error) {
	secret, err := sharedServingSecret(ctx, client)
	if err != nil {
		return tls.Certificate{}, nil, err
	}
	return decodeServingSecret(secret)
}

func sharedServingSecret(ctx context.Context, client kubernetes.Interface) (*corev1.Secret, error) {
	secrets := client.CoreV1().Secrets(servingNamespace)
	secret, err := secrets.Get(ctx, servingSecretName, metav1.GetOptions{})
	if apierrors.IsNotFound(err) {
		certificate, ca, generateErr := generateSelfSignedCert()
		if generateErr != nil {
			return nil, generateErr
		}
		key, marshalErr := privateKeyPEM(certificate)
		if marshalErr != nil {
			return nil, marshalErr
		}
		secret, err = secrets.Create(ctx, &corev1.Secret{
			ObjectMeta: metav1.ObjectMeta{Name: servingSecretName, Namespace: servingNamespace,
				Labels: map[string]string{"app.kubernetes.io/managed-by": "uds-native-controller"}},
			Type: corev1.SecretTypeTLS,
			Data: map[string][]byte{"tls.crt": ca, "tls.key": key, "ca.crt": ca},
		}, metav1.CreateOptions{})
		if apierrors.IsAlreadyExists(err) {
			secret, err = secrets.Get(ctx, servingSecretName, metav1.GetOptions{})
		}
	}
	if err != nil {
		return nil, fmt.Errorf("shared serving certificate: %w", err)
	}
	return secret, nil
}

func decodeServingSecret(secret *corev1.Secret) (tls.Certificate, []byte, error) {
	pair, err := tls.X509KeyPair(secret.Data["tls.crt"], secret.Data["tls.key"])
	if err != nil {
		return tls.Certificate{}, nil, fmt.Errorf("invalid shared serving certificate: %w", err)
	}
	ca := secret.Data["ca.crt"]
	if block, _ := pem.Decode(ca); block == nil {
		return tls.Certificate{}, nil, fmt.Errorf("shared serving CA is missing")
	}
	roots := x509.NewCertPool()
	if !roots.AppendCertsFromPEM(ca) {
		return tls.Certificate{}, nil, fmt.Errorf("invalid shared serving CA")
	}
	leaf, err := x509.ParseCertificate(pair.Certificate[0])
	if err != nil {
		return tls.Certificate{}, nil, err
	}
	intermediates := x509.NewCertPool()
	for _, raw := range pair.Certificate[1:] {
		cert, err := x509.ParseCertificate(raw)
		if err != nil {
			return tls.Certificate{}, nil, err
		}
		intermediates.AddCert(cert)
	}
	if _, err := leaf.Verify(x509.VerifyOptions{DNSName: "uds-controller.uds-system.svc", Roots: roots, Intermediates: intermediates}); err != nil {
		return tls.Certificate{}, nil, fmt.Errorf("untrusted shared serving certificate: %w", err)
	}
	pair.Leaf = leaf
	return pair, ca, nil
}
