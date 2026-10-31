// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package main

import (
	"context"
	"crypto/tls"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"strings"
	"sync/atomic"
	"time"

	"github.com/defenseunicorns/uds-core/src/dev-identity/internal/devidentity"
	api "github.com/dexidp/dex/api/v2"
	"github.com/google/uuid"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
)

type hostRouter struct {
	public, admin *devidentity.Bridge
	ready         atomic.Bool
}

func (h *hostRouter) ServeHTTP(writer http.ResponseWriter, request *http.Request) {
	if request.URL.Path == "/health/ready" || request.URL.Path == "/health/started" || request.URL.Path == "/health/live" {
		if request.URL.Path != "/health/live" && !h.ready.Load() {
			writer.WriteHeader(503)
			return
		}
		writer.WriteHeader(200)
		return
	}
	if h.admin != nil && request.Host == h.admin.PublicHost {
		h.admin.ServeHTTP(writer, request)
		return
	}
	if request.Host != h.public.PublicHost && browserIdentityPath(request.URL.Path, h.public.IssuerPath) {
		http.Error(writer, "This development provider supports only its configured public and admin origins", http.StatusMisdirectedRequest)
		return
	}
	h.public.ServeHTTP(writer, request)
}

func browserIdentityPath(path, issuer string) bool {
	if path == "/" || path == "/login" || (strings.HasPrefix(path, "/admin/") && !strings.HasPrefix(path, "/admin/realms/")) {
		return true
	}
	return path == issuer+"/.well-known/openid-configuration" || path == issuer+"/auth" || path == issuer+"/protocol/openid-connect/auth" || path == issuer+"/account" || strings.HasPrefix(path, issuer+"/callback/")
}

func makeBridge(directory devidentity.Directory, cfg configuration, upstream, host string) (*devidentity.Bridge, error) {
	target, err := url.Parse(upstream)
	if err != nil || target.Scheme != "https" || target.Host == "" {
		return nil, fmt.Errorf("Dex upstream requires HTTPS")
	}
	roots, err := rootPool(cfg.DexRootCA)
	if err != nil {
		return nil, err
	}
	transport := &http.Transport{TLSClientConfig: &tls.Config{RootCAs: roots, MinVersion: tls.VersionTLS12}}
	bridge := devidentity.NewBridge(directory, target, transport, host, cfg.IssuerPath)
	bridge.JSONGroupHeader = true
	bridge.ManagedDefaults = true
	return bridge, nil
}

func initialize(ctx context.Context, cfg configuration) (*hostRouter, *devidentity.Management, func(), error) {
	clusterConfig, err := rest.InClusterConfig()
	if err != nil {
		return nil, nil, func() {}, err
	}
	// Interactive logins and management share this client. Bound the bridge's
	// budget explicitly instead of client-go's 5 QPS default; desired-state
	// reconciliation reads one snapshot and avoids unchanged writes.
	clusterConfig.QPS, clusterConfig.Burst = 20, 40
	client, err := kubernetes.NewForConfig(clusterConfig)
	if err != nil {
		return nil, nil, func() {}, err
	}
	directory := devidentity.NewKubeDirectory(client.CoreV1().Secrets(cfg.Namespace))
	store := devidentity.NewKubeState(client.CoreV1().Secrets(cfg.Namespace))
	if err := devidentity.RevokeDisabledFleetTokens(ctx, store, cfg.FleetClientEnabled); err != nil {
		return nil, nil, func() {}, err
	}
	apis, closeAPIs, err := connectAPIs(ctx, cfg.DexAPIs)
	if err != nil {
		return nil, nil, closeAPIs, err
	}
	clients := devidentity.NewReplicatedClients(store, apis...)
	packageClient, err := dynamic.NewForConfig(clusterConfig)
	if err != nil {
		return nil, nil, closeAPIs, err
	}
	clients.Packages = devidentity.KubeCorePackages{Client: packageClient}
	clients.CoreAudiencePairsEnabled = cfg.CoreAudiencePairsEnabled
	public, err := makeBridge(directory, cfg, cfg.DexUpstream, cfg.PublicHost)
	if err != nil {
		return nil, nil, closeAPIs, err
	}
	public.Sessions = devidentity.NewScopedPersistentSessions(store, cfg.PublicHost)
	authority := &devidentity.KubeAuthority{Core: client.CoreV1(), Auth: client.AuthenticationV1(), Namespace: cfg.Namespace, FleetAudience: cfg.FleetAudience, FleetClientEnabled: cfg.FleetClientEnabled, FleetNamespace: cfg.FleetNamespace, FleetServiceAccount: cfg.FleetServiceAccount}
	authority.OperatorNamespace, authority.OperatorServiceAccount = cfg.OperatorNamespace, cfg.OperatorServiceAccount
	management := devidentity.NewManagement(directory, store, clients, public.Sessions, authority, cfg.PublicHost, cfg.AdminHost)
	management.Audit = os.Stdout
	public.Admin = management
	router := &hostRouter{public: public}
	if cfg.AdminHost != "" {
		admin, err := makeBridge(directory, cfg, cfg.AdminDexUpstream, cfg.AdminHost)
		if err != nil {
			return nil, nil, closeAPIs, err
		}
		admin.Sessions = devidentity.NewScopedPersistentSessions(store, cfg.AdminHost)
		admin.Admin = management
		router.admin = admin
	}
	if err := seed(ctx, cfg, directory, management); err != nil {
		return nil, nil, closeAPIs, err
	}
	if err := clients.Restore(ctx); err != nil {
		return nil, nil, closeAPIs, err
	}
	router.ready.Store(true)
	return router, management, closeAPIs, nil
}

func connectAPIs(ctx context.Context, settings []apiConnection) ([]devidentity.DexClients, func(), error) {
	connections := []*grpc.ClientConn{}
	closeAll := func() {
		for _, conn := range connections {
			_ = conn.Close()
		}
	}
	clients := []devidentity.DexClients{}
	for _, setting := range settings {
		roots, err := rootPool(setting.RootCA)
		if err != nil {
			return nil, closeAll, err
		}
		certificate, err := tls.LoadX509KeyPair(setting.ClientCert, setting.ClientKey)
		if err != nil {
			return nil, closeAll, err
		}
		connection, err := grpc.NewClient(setting.Address, grpc.WithTransportCredentials(credentials.NewTLS(&tls.Config{RootCAs: roots, Certificates: []tls.Certificate{certificate}, ServerName: setting.ServerName, MinVersion: tls.VersionTLS12})))
		if err != nil {
			return nil, closeAll, err
		}
		connections = append(connections, connection)
		client := api.NewDexClient(connection)
		deadline, cancel := context.WithTimeout(ctx, 2*time.Minute)
		for {
			attempt, cancelAttempt := context.WithTimeout(deadline, 5*time.Second)
			_, err = client.GetVersion(attempt, &api.VersionReq{})
			cancelAttempt()
			if err == nil {
				break
			}
			select {
			case <-deadline.Done():
				cancel()
				return nil, closeAll, fmt.Errorf("Dex TLS management API unavailable: %w", err)
			case <-time.After(time.Second):
			}
		}
		cancel()
		clients = append(clients, client)
	}
	return clients, closeAll, nil
}

func seed(ctx context.Context, cfg configuration, directory *devidentity.KubeDirectory, management *devidentity.Management) error {
	var initialized bool
	if err := management.Store.Get(ctx, "config", "bootstrap", &initialized); err == nil && initialized {
		return nil
	} else if err != nil && !apierrors.IsNotFound(err) {
		return err
	}
	existing, err := directory.List(ctx)
	if err != nil {
		return err
	}
	for _, user := range cfg.Users {
		found := false
		for _, saved := range existing {
			if saved.ID == user.ID || (saved.Username == user.Username && saved.Realm == user.Realm) {
				found = true
				break
			}
		}
		if !found {
			if err := directory.Save(ctx, user); err != nil {
				return err
			}
		}
	}
	if err := management.SeedGroup(ctx, "uds", "/UDS Core/Admin"); err != nil {
		return err
	}
	bootstrap := append([]devidentity.ClientRecord{{Realm: "uds", Data: map[string]any{"clientId": "account", "enabled": true, "publicClient": true, "redirectUris": []string{"https://" + cfg.PublicHost + "/realms/uds/account"}}}}, cfg.Clients...)
	for _, record := range bootstrap {
		if _, err := management.Clients.Find(ctx, record.Realm, record.ClientID()); err == nil {
			continue
		}
		if record.ID() == "" {
			record.Data["id"] = uuid.NewSHA1(uuid.NameSpaceURL, []byte(record.Realm+":"+record.ClientID())).String()
		}
		if err := management.Clients.Save(ctx, record); err != nil {
			return err
		}
	}
	return management.Store.Put(ctx, "config", "bootstrap", true)
}

func healthAndMetrics(handler *hostRouter) http.Handler {
	mux := http.NewServeMux()
	mux.Handle("/metrics", promhttp.Handler())
	mux.Handle("/", handler)
	return mux
}
