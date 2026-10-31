// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

// Package featureflags describes internal reconciliation phases. Core always owns
// every phase; these fields remain injectable only in focused controller tests.
package featureflags

import "errors"

var ErrIncompleteOwnership = errors.New("Core controller requires full Package lifecycle ownership")

// Flags holds the reconciliation phases owned by Core.
type Flags struct {
	NetworkPolicies       bool
	AuthorizationPolicies bool
	IstioInjection        bool
	IstioIngress          bool
	IstioEgress           bool
	SSO                   bool
	PodMonitors           bool
	ServiceMonitors       bool
	UptimeProbes          bool
	CABundle              bool
}

// Load returns the complete Core lifecycle. There is no implementation selector
// or environment-controlled partial ownership in a standard Core installation.
func Load() Flags {
	return Flags{NetworkPolicies: true, AuthorizationPolicies: true, IstioInjection: true,
		IstioIngress: true, IstioEgress: true, SSO: true, PodMonitors: true,
		ServiceMonitors: true, UptimeProbes: true, CABundle: true}
}

// ValidateOwnership rejects partial writers because Package status and finalizers
// remain one shared contract. The process does not implement admission-only mode.
func (f Flags) ValidateOwnership() error {
	if !f.NetworkPolicies || !f.AuthorizationPolicies || !f.IstioInjection || !f.IstioIngress || !f.IstioEgress || !f.SSO || !f.PodMonitors || !f.ServiceMonitors || !f.UptimeProbes || !f.CABundle {
		return ErrIncompleteOwnership
	}
	return nil
}
