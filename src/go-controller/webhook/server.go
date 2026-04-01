// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package webhook

import (
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"log/slog"
	"math/big"
	"net/http"
	"time"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/client-go/kubernetes"

	"github.com/defenseunicorns/uds-core/src/go-controller/internal/store"
)

const (
	webhookConfigName         = "uds-controller-clusterconfig"
	mutatingWebhookConfigName = "uds-controller-waypoint"
	webhookPort               = ":9443"
)

// StartWebhookServer generates a self-signed TLS certificate, patches the caBundle into the
// ValidatingWebhookConfiguration and MutatingWebhookConfiguration resources, and starts an
// HTTPS server on port 9443. The server shuts down when ctx is cancelled.
func StartWebhookServer(ctx context.Context, clientset kubernetes.Interface, exemptions *ExemptionStore, ws *store.WaypointStore) error {
	tlsCert, caPEM, err := generateSelfSignedCert()
	if err != nil {
		return fmt.Errorf("generating self-signed cert: %w", err)
	}

	if err := patchAllCABundles(ctx, clientset, caPEM); err != nil {
		return fmt.Errorf("patching caBundle: %w", err)
	}

	if err := patchMutatingCABundle(ctx, clientset, caPEM); err != nil {
		return fmt.Errorf("patching mutating caBundle: %w", err)
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/validate-clusterconfig-delete", DenyClusterConfigDeletion())
	mux.HandleFunc("/validate-pods", ValidatePod(exemptions))
	mux.HandleFunc("/mutate-pods", MutateNonRootUser(exemptions))
	mux.HandleFunc("/mutate-pod-waypoint", MutatePodWaypoint(ws))
	mux.HandleFunc("/mutate-service-waypoint", MutateServiceWaypoint(ws))

	server := &http.Server{
		Addr:    webhookPort,
		Handler: mux,
		TLSConfig: &tls.Config{
			Certificates: []tls.Certificate{tlsCert},
			MinVersion:   tls.VersionTLS12,
		},
	}

	go func() {
		slog.Info("Starting webhook server", "addr", webhookPort)
		if err := server.ListenAndServeTLS("", ""); err != nil && err != http.ErrServerClosed {
			slog.Error("Webhook server failed", "error", err)
		}
	}()

	go func() {
		<-ctx.Done()
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := server.Shutdown(shutdownCtx); err != nil {
			slog.Error("Webhook server shutdown error", "error", err)
		}
	}()

	return nil
}

func generateSelfSignedCert() (tls.Certificate, []byte, error) {
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		return tls.Certificate{}, nil, fmt.Errorf("generating key: %w", err)
	}

	serialNumber, err := rand.Int(rand.Reader, new(big.Int).Lsh(big.NewInt(1), 128))
	if err != nil {
		return tls.Certificate{}, nil, fmt.Errorf("generating serial number: %w", err)
	}

	template := &x509.Certificate{
		SerialNumber: serialNumber,
		Subject: pkix.Name{
			CommonName: "uds-controller.uds-system.svc",
		},
		DNSNames: []string{
			"uds-controller.uds-system.svc",
			"uds-controller.uds-system.svc.cluster.local",
		},
		NotBefore:             time.Now(),
		NotAfter:              time.Now().Add(365 * 24 * time.Hour),
		KeyUsage:              x509.KeyUsageDigitalSignature,
		ExtKeyUsage:           []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},
		BasicConstraintsValid: true,
	}

	certDER, err := x509.CreateCertificate(rand.Reader, template, template, &key.PublicKey, key)
	if err != nil {
		return tls.Certificate{}, nil, fmt.Errorf("creating certificate: %w", err)
	}

	certPEM := pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: certDER})
	keyDER, err := x509.MarshalECPrivateKey(key)
	if err != nil {
		return tls.Certificate{}, nil, fmt.Errorf("marshaling key: %w", err)
	}
	keyPEM := pem.EncodeToMemory(&pem.Block{Type: "EC PRIVATE KEY", Bytes: keyDER})

	tlsCert, err := tls.X509KeyPair(certPEM, keyPEM)
	if err != nil {
		return tls.Certificate{}, nil, fmt.Errorf("creating TLS keypair: %w", err)
	}

	return tlsCert, certPEM, nil
}

func patchMutatingCABundle(ctx context.Context, clientset kubernetes.Interface, caPEM []byte) error {
	patch := []map[string]interface{}{
		{
			"op":    "replace",
			"path":  "/webhooks/0/clientConfig/caBundle",
			"value": caPEM,
		},
		{
			"op":    "replace",
			"path":  "/webhooks/1/clientConfig/caBundle",
			"value": caPEM,
		},
	}
	patchBytes, err := json.Marshal(patch)
	if err != nil {
		return fmt.Errorf("marshaling patch: %w", err)
	}

	_, err = clientset.AdmissionregistrationV1().MutatingWebhookConfigurations().Patch(
		ctx,
		mutatingWebhookConfigName,
		types.JSONPatchType,
		patchBytes,
		metav1.PatchOptions{},
	)
	if err != nil {
		return fmt.Errorf("patching mutating webhook configuration: %w", err)
	}

	slog.Info("Patched caBundle into MutatingWebhookConfiguration", "name", mutatingWebhookConfigName)
	return nil
}

func patchAllCABundles(ctx context.Context, clientset kubernetes.Interface, caPEM []byte) error {
	// Patch both webhook entries (index 0 = main, index 1 = istio-system with failurePolicy: Ignore)
	twoWebhookPatch := []map[string]interface{}{
		{"op": "replace", "path": "/webhooks/0/clientConfig/caBundle", "value": caPEM},
		{"op": "replace", "path": "/webhooks/1/clientConfig/caBundle", "value": caPEM},
	}
	twoWebhookPatchBytes, err := json.Marshal(twoWebhookPatch)
	if err != nil {
		return fmt.Errorf("marshaling patch: %w", err)
	}

	// uds-controller-clusterconfig has only one webhook entry
	oneWebhookPatch := []map[string]interface{}{
		{"op": "replace", "path": "/webhooks/0/clientConfig/caBundle", "value": caPEM},
	}
	oneWebhookPatchBytes, err := json.Marshal(oneWebhookPatch)
	if err != nil {
		return fmt.Errorf("marshaling patch: %w", err)
	}

	_, err = clientset.AdmissionregistrationV1().ValidatingWebhookConfigurations().Patch(
		ctx, webhookConfigName, types.JSONPatchType, oneWebhookPatchBytes, metav1.PatchOptions{},
	)
	if err != nil {
		return fmt.Errorf("patching ValidatingWebhookConfiguration %s: %w", webhookConfigName, err)
	}
	slog.Info("Patched caBundle", "kind", "ValidatingWebhookConfiguration", "name", webhookConfigName)

	_, err = clientset.AdmissionregistrationV1().ValidatingWebhookConfigurations().Patch(
		ctx, "uds-controller-pods", types.JSONPatchType, twoWebhookPatchBytes, metav1.PatchOptions{},
	)
	if err != nil {
		return fmt.Errorf("patching ValidatingWebhookConfiguration uds-controller-pods: %w", err)
	}
	slog.Info("Patched caBundle", "kind", "ValidatingWebhookConfiguration", "name", "uds-controller-pods")

	_, err = clientset.AdmissionregistrationV1().MutatingWebhookConfigurations().Patch(
		ctx, "uds-controller-pods", types.JSONPatchType, twoWebhookPatchBytes, metav1.PatchOptions{},
	)
	if err != nil {
		return fmt.Errorf("patching MutatingWebhookConfiguration uds-controller-pods: %w", err)
	}
	slog.Info("Patched caBundle", "kind", "MutatingWebhookConfiguration", "name", "uds-controller-pods")

	return nil
}
