// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
package clusterconfig

import (
	udstypes "github.com/defenseunicorns/uds-core/src/go-controller/api/uds/v1alpha1"
	"github.com/defenseunicorns/uds-core/src/go-controller/internal/config"
	"k8s.io/utils/ptr"
	"testing"
)

func TestConfigRemovalRestoresDefaultsAndKeepsDiscovery(t *testing.T) {
	old := config.Get()
	t.Cleanup(func() { config.Replace(old) })
	config.Replace(config.Config{DiscoveredAPICIDRs: []string{"10.0.0.1/32"}})
	cfg := &udstypes.ClusterConfig{Spec: udstypes.ClusterConfigSpec{Expose: udstypes.ClusterConfigExpose{Domain: "example.dev"}, Networking: &udstypes.ClusterConfigNetworking{KubeApiCIDR: ptr.To("192.0.2.0/24")}, CABundle: &udstypes.ClusterConfigCABundle{Certs: ptr.To("custom"), IncludeDoDCerts: ptr.To(true)}}}
	LoadMemory(cfg)
	cfg.Spec.Networking = nil
	cfg.Spec.CABundle = nil
	cfg.Spec.Expose.Domain = "###ZARF_VAR_DOMAIN###"
	LoadMemory(cfg)
	got := config.Get()
	if got.KubeApiCIDR != "" || got.CABundle.Certs != "" || got.CABundle.IncludeDoDCerts || got.Domain != "uds.dev" || got.AdminDomain != "admin.uds.dev" || len(got.DiscoveredAPICIDRs) != 1 {
		t.Fatalf("deleted override remained active: %#v", got)
	}
}
