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
	"encoding/pem"
	"fmt"
	"log/slog"
	"math/big"
	"net"
	"net/http"
	"time"

	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/tools/cache"

	"github.com/defenseunicorns/uds-core/src/go-controller/internal/store"
)

const (
	webhookConfigName         = "uds-controller-clusterconfig"
	mutatingWebhookConfigName = "uds-controller-waypoint"
	webhookPort               = ":9443"
)

// StartWebhookServer loads the shared serving certificate, patches its CA bundle into the
// ValidatingWebhookConfiguration and MutatingWebhookConfiguration resources, and starts an
// HTTPS server on port 9443. The server shuts down when ctx is cancelled.
func StartWebhookServer(ctx context.Context, clientset kubernetes.Interface, exemptions *ExemptionStore, ws *store.WaypointStore, packageInformer cache.SharedIndexInformer) error {
	manager, err := newServingManager(ctx, clientset)
	if err != nil {
		return fmt.Errorf("load admission serving identity: %w", err)
	}
	mux := http.NewServeMux()
	mux.HandleFunc("/readyz", manager.Ready)
	mux.HandleFunc("/validate-clusterconfig-delete", DenyClusterConfigDeletion())
	mux.HandleFunc("/validate-resources", ValidateResources(packageInformer))
	mux.HandleFunc("/validate-pods", ValidatePod(exemptions))
	mux.HandleFunc("/mutate-pods", MutateNonRootUser(exemptions))
	mux.HandleFunc("/mutate-pod-waypoint", MutatePodWaypoint(ws, packageInformer))
	mux.HandleFunc("/mutate-service-waypoint", MutateServiceWaypoint(ws, packageInformer))

	server := &http.Server{
		Addr:        webhookPort,
		Handler:     fenceAdmissions(ctx, mux),
		BaseContext: func(net.Listener) context.Context { return ctx },
		TLSConfig: &tls.Config{
			GetCertificate: manager.GetCertificate,
			MinVersion:     tls.VersionTLS12,
		},
	}

	listener, err := net.Listen("tcp", webhookPort)
	if err != nil {
		return fmt.Errorf("listen for admission: %w", err)
	}
	state := &admissionServingState{manager: manager, ctx: ctx}
	state.listening.Store(true)
	admissionState.Store(state)
	go manager.Run(ctx)
	go func() {
		defer state.listening.Store(false)
		slog.Info("Starting webhook server", "addr", webhookPort)
		if err := server.ServeTLS(listener, "", ""); err != nil && err != http.ErrServerClosed {
			slog.Error("Webhook server failed", "error", err)
		}
	}()

	go func() {
		<-ctx.Done()
		state.listening.Store(false)
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
