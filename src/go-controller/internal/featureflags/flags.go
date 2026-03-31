// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

// Package featureflags reads the same UDS_OPERATOR_*_ENABLED env vars used by
// Pepr but interprets them inversely: when Pepr is disabled for a phase
// (env == "false"), the Go controller is enabled for that phase.
package featureflags

import "os"

// Flags holds the per-phase feature flags for the Go controller.
// A flag is true when the Go controller should handle that phase.
type Flags struct {
	NetworkPolicies      bool
	AuthorizationPolicies bool
	IstioInjection       bool
	IstioIngress         bool
	IstioEgress          bool
	SSO                  bool
	PodMonitors          bool
	ServiceMonitors      bool
	UptimeProbes         bool
	CABundle             bool
}

// Load reads feature flags from environment variables.
// The Go controller is enabled for a phase when the corresponding env var
// is set to "false" (meaning Pepr is disabled for that phase).
func Load() Flags {
	return Flags{
		NetworkPolicies:      goEnabled("UDS_OPERATOR_NETWORK_POLICIES_ENABLED"),
		AuthorizationPolicies: goEnabled("UDS_OPERATOR_AUTHORIZATION_POLICIES_ENABLED"),
		IstioInjection:       goEnabled("UDS_OPERATOR_ISTIO_INJECTION_ENABLED"),
		IstioIngress:         goEnabled("UDS_OPERATOR_ISTIO_INGRESS_ENABLED"),
		IstioEgress:          goEnabled("UDS_OPERATOR_ISTIO_EGRESS_ENABLED"),
		SSO:                  goEnabled("UDS_OPERATOR_SSO_ENABLED"),
		PodMonitors:          goEnabled("UDS_OPERATOR_POD_MONITORS_ENABLED"),
		ServiceMonitors:      goEnabled("UDS_OPERATOR_SERVICE_MONITORS_ENABLED"),
		UptimeProbes:         goEnabled("UDS_OPERATOR_UPTIME_PROBES_ENABLED"),
		CABundle:             goEnabled("UDS_OPERATOR_CA_BUNDLE_ENABLED"),
	}
}

// goEnabled returns true when the Pepr flag is explicitly "false",
// meaning the Go controller should handle this phase.
func goEnabled(envName string) bool {
	return os.Getenv(envName) == "false"
}
