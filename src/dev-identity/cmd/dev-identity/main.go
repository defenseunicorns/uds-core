// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package main

import (
	"context"
	"crypto/tls"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/defenseunicorns/uds-core/src/dev-identity/internal/devidentity"
)

func main() {
	if len(os.Args) != 2 {
		fail("configuration", os.ErrInvalid)
	}
	cfg, err := readConfiguration(os.Args[1])
	if err != nil {
		fail("configuration", err)
	}
	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()
	handler, management, closeAPIs, err := initialize(ctx, cfg)
	if err != nil {
		fail("initialization", err)
	}
	defer closeAPIs()
	privateMux := http.NewServeMux()
	privateMux.HandleFunc("/internal/identity", handler.public.IdentityRefresh)
	privateMux.HandleFunc("/internal/service-identity", management.ServiceIdentity)
	privateMux.HandleFunc("/internal/user-authorization", management.UserAuthorization)
	clientRoots, err := rootPool(cfg.RefreshClientCA)
	if err != nil {
		fail("client trust", err)
	}
	servers := []*http.Server{
		{Addr: ":8443", Handler: handler, TLSConfig: &tls.Config{MinVersion: tls.VersionTLS12}},
		{Addr: ":8080", Handler: handler},
		{Addr: ":9000", Handler: healthAndMetrics(handler)},
		{Addr: ":9443", Handler: privateMux, TLSConfig: &tls.Config{MinVersion: tls.VersionTLS12, ClientAuth: tls.RequireAndVerifyClientCert, ClientCAs: clientRoots}},
	}
	failures := make(chan error, len(servers))
	for _, server := range servers {
		server.ReadHeaderTimeout = 5 * time.Second
		server.IdleTimeout = 60 * time.Second
		go func() {
			if server.Addr == ":8080" || server.Addr == ":9000" {
				failures <- server.ListenAndServe()
			} else {
				failures <- server.ListenAndServeTLS(cfg.ServingCert, cfg.ServingKey)
			}
		}()
	}
	go restoreClients(ctx, management, handler)
	failed := false
	select {
	case <-ctx.Done():
	case err := <-failures:
		if err != nil && err != http.ErrServerClosed {
			slog.Error("Identity listener failed", "error", err)
			failed = true
		}
	}
	cancel()
	stopped, cancelStop := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancelStop()
	for _, server := range servers {
		_ = server.Shutdown(stopped)
	}
	if failed {
		os.Exit(1)
	}
}

func restoreClients(ctx context.Context, management *devidentity.Management, handler *hostRouter) {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			attempt, cancel := context.WithTimeout(ctx, 10*time.Second)
			completed, err := management.Clients.RestoreIfIdle(attempt)
			if !completed && err == nil {
				cancel()
				continue
			}
			if err == nil {
				err = management.PruneExpired(attempt)
			}
			cancel()
			handler.ready.Store(err == nil)
			if err != nil {
				slog.Error("Dex client reconciliation failed", "error", err)
			}
		}
	}
}

func fail(step string, err error) {
	slog.Error("Identity startup failed", "step", step, "error", err)
	os.Exit(1)
}
