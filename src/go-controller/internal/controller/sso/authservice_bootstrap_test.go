// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
package sso

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"testing"

	udstypes "github.com/defenseunicorns/uds-core/src/go-controller/api/uds/v1alpha1"
	"github.com/defenseunicorns/uds-core/src/go-controller/internal/config"
	appsv1 "k8s.io/api/apps/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes/fake"
)

func assertInactiveBootstrap(t *testing.T, cfg *AuthserviceConfig) {
	t.Helper()
	if cfg.AllowUnmatched || cfg.DefaultOIDC == nil || cfg.DefaultOIDC.SkipVerifyPeerCert || len(cfg.Chains) != 1 {
		t.Fatal("inactive configuration lost fail-closed defaults or nonempty chain contract")
	}
	chain := cfg.Chains[0]
	if chain.Name != "placeholder" || chain.Match.Header != ":authority" || chain.Match.Prefix != "localhost" || len(chain.Filters) != 1 {
		t.Fatalf("inactive placeholder broadened routing: %#v", chain)
	}
	oidc := chain.Filters[0].OIDCOverride
	if oidc == nil || oidc.ClientID != "placeholder" || oidc.ClientSecret != "placeholder" || oidc.CallbackURI != "https://localhost/login" {
		t.Fatal("placeholder no longer matches original source contract")
	}
}

func captureAuthserviceCase(t *testing.T, name string, cfg *AuthserviceConfig) {
	t.Helper()
	if directory := os.Getenv("UDS_AUTH_CONFIG_CAPTURE_DIR"); directory != "" {
		if !filepath.IsAbs(directory) {
			t.Fatal("capture directory must be explicit and absolute")
		}
		if err := os.MkdirAll(directory, 0o755); err != nil {
			t.Fatal(err)
		}
		data, err := json.MarshalIndent(cfg, "", "  ")
		if err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(directory, name+".json"), append(data, '\n'), 0o644); err != nil {
			t.Fatal(err)
		}
	}
}

func TestAuthserviceBootstrapAndLastRemovalRetainOriginalInactiveContract(t *testing.T) {
	ctx := context.Background()
	prior := config.Get()
	t.Cleanup(func() { config.Update(func(next *config.Config) { *next = prior }) })
	config.Update(func(next *config.Config) { next.Domain = "uds.dev" })
	client := fake.NewClientset(&appsv1.Deployment{ObjectMeta: metav1.ObjectMeta{Name: "authservice", Namespace: authserviceNamespace}})
	initial := buildDefaultAuthserviceConfig("uds.dev")
	assertInactiveBootstrap(t, initial)
	captureAuthserviceCase(t, "zero-clients", initial)
	broken := buildDefaultAuthserviceConfig("uds.dev")
	broken.Chains = []AuthserviceChain{}
	captureAuthserviceCase(t, "old-empty-invalid", broken)
	if _, err := updateAuthserviceConfig(ctx, client.CoreV1(), broken); err != nil {
		t.Fatal(err)
	}
	got, err := getAuthserviceConfig(ctx, client.CoreV1())
	if err != nil {
		t.Fatal(err)
	}
	assertInactiveBootstrap(t, got)
	if !reflect.DeepEqual(got.Chains, initial.Chains) {
		t.Fatal("repair differs from the bootstrap source contract")
	}
	// Model a preexisting Go configuration containing one real client and no
	// placeholder. Deletion must publish a valid non-authorizing configuration.
	pkg := &udstypes.UDSPackage{Status: udstypes.PackageStatus{AuthserviceClients: []udstypes.AuthserviceClient{{ClientID: "last-real-client"}}}}
	got.Chains = []AuthserviceChain{buildChain(udstypes.Sso{}, Client{ClientID: "last-real-client", Secret: "test-only", RedirectUris: []string{"https://app.uds.dev/login"}}, "uds.dev")}
	if _, err := updateAuthserviceConfig(ctx, client.CoreV1(), got); err != nil {
		t.Fatal(err)
	}
	if err := PurgeAuthserviceClients(ctx, client, pkg); err != nil {
		t.Fatal(err)
	}
	got, err = getAuthserviceConfig(ctx, client.CoreV1())
	if err != nil {
		t.Fatal(err)
	}
	assertInactiveBootstrap(t, got)
	captureAuthserviceCase(t, "last-client-removed", got)
}

func TestInactiveRepairPreservesEveryRealChainAndStableWrites(t *testing.T) {
	ctx := context.Background()
	client := fake.NewClientset()
	cfg := buildDefaultAuthserviceConfig("uds.dev")
	cfg.Chains = []AuthserviceChain{buildChain(udstypes.Sso{}, Client{ClientID: "real", Secret: "test-only", RedirectUris: []string{"https://app.uds.dev/login"}}, "uds.dev")}
	chains := append([]AuthserviceChain{}, cfg.Chains...)
	if changed, err := updateAuthserviceConfig(ctx, client.CoreV1(), cfg); !changed || err != nil {
		t.Fatal(changed, err)
	}
	if !reflect.DeepEqual(cfg.Chains, chains) {
		t.Fatal("inactive repair replaced live authorization chains")
	}
	client.ClearActions()
	if changed, err := updateAuthserviceConfig(ctx, client.CoreV1(), cfg); changed || err != nil {
		t.Fatal("stable real config was rewritten", changed, err)
	}
	for _, action := range client.Actions() {
		if action.GetVerb() == "update" || action.GetVerb() == "create" {
			t.Fatal("stable config performed an unnecessary write")
		}
	}
}
