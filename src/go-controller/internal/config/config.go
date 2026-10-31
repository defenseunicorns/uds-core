// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

// Package config holds the in-memory cluster configuration derived from the ClusterConfig CR.
// It mirrors the UDSConfig singleton in src/pepr/operator/controllers/config/config.ts.
package config

import (
	"reflect"
	"slices"
	"sort"
	"sync"
)

// CABundle holds the cluster CA bundle configuration.
type CABundle struct {
	DoDCerts    string
	PublicCerts string
	// Certs is the base64-encoded PEM bundle of user-provided CA certificates.
	Certs string
	// IncludeDoDCerts controls whether DoD CA certificates are included in the bundle.
	IncludeDoDCerts bool
	// IncludePublicCerts controls whether public CA certificates are included in the bundle.
	IncludePublicCerts bool
}

// Config holds the in-memory cluster configuration populated from the ClusterConfig CR.
// Mirrors the Config type in src/pepr/operator/controllers/config/types.ts.
type Config struct {
	AllowPublicClients  bool
	KeycloakClientMode  string
	AuthserviceRedisUri string
	DiscoveredAPICIDRs  []string
	APIServiceCIDRs     []string
	DiscoveredNodeCIDRs []string
	// Domain is the domain all cluster services are exposed on.
	Domain string
	// AdminDomain is the domain for admin gateway services.
	AdminDomain string
	// CABundle holds the cluster CA certificate bundle configuration.
	CABundle CABundle
	// AllowAllNSExemptions controls whether UDS Exemption CRs may live in any namespace.
	AllowAllNSExemptions bool
	// KubeApiCIDR is the CIDR range for Kubernetes control plane nodes.
	KubeApiCIDR string
	// KubeNodeCIDRs are the CIDRs for all Kubernetes nodes.
	KubeNodeCIDRs []string
}

var (
	mu  sync.RWMutex
	cfg = Config{Domain: "uds.dev", AdminDomain: "admin.uds.dev", KeycloakClientMode: "CLIENT_SECRET"}
)

// Get returns a snapshot of the current cluster config. Safe for concurrent use.
func Get() Config {
	mu.RLock()
	defer mu.RUnlock()
	copy := cfg
	copy.KubeNodeCIDRs = append([]string(nil), cfg.KubeNodeCIDRs...)
	copy.DiscoveredAPICIDRs = slices.Clone(cfg.DiscoveredAPICIDRs)
	copy.APIServiceCIDRs = slices.Clone(cfg.APIServiceCIDRs)
	copy.DiscoveredNodeCIDRs = slices.Clone(cfg.DiscoveredNodeCIDRs)
	return copy
}

// Update applies a mutation function to the cluster config under a write lock.
// Safe for concurrent use.
func Update(fn func(*Config)) {
	mu.Lock()
	defer mu.Unlock()
	fn(&cfg)
}

// APICIDRs always includes the cluster Service IP even when endpoint discovery is overridden.
func (c Config) APICIDRs() []string {
	cidrs := slices.Clone(c.APIServiceCIDRs)
	if c.KubeApiCIDR != "" {
		cidrs = append(cidrs, c.KubeApiCIDR)
	} else {
		cidrs = append(cidrs, c.DiscoveredAPICIDRs...)
	}
	sort.Strings(cidrs)
	return slices.Compact(cidrs)
}
func (c Config) NodeCIDRs() []string {
	if len(c.KubeNodeCIDRs) > 0 {
		return slices.Clone(c.KubeNodeCIDRs)
	}
	return slices.Clone(c.DiscoveredNodeCIDRs)
}

// Replace applies a computed snapshot, returning whether any value changed.
func Replace(next Config) bool {
	mu.Lock()
	defer mu.Unlock()
	if reflect.DeepEqual(cfg, next) {
		return false
	}
	cfg = next
	return true
}
