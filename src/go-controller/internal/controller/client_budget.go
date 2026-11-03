// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
package controller

import (
	"k8s.io/client-go/rest"
	"k8s.io/client-go/util/flowcontrol"
)

// Use one bounded budget for the controller's typed, dynamic and UDS clients.
// The default client-go per-client 5 QPS throttle serializes ordinary no-op
// reconciliation into seconds of local waiting. Preserve explicit overrides,
// including negative QPS (rate limiting disabled), and never mutate the caller.
func controllerClientConfig(base *rest.Config) *rest.Config {
	cfg := rest.CopyConfig(base)
	if cfg.RateLimiter != nil || cfg.QPS < 0 {
		return cfg
	}
	if cfg.QPS == 0 {
		cfg.QPS = 20
	}
	if cfg.Burst == 0 {
		cfg.Burst = 40
	}
	if cfg.Burst > 0 {
		cfg.RateLimiter = flowcontrol.NewTokenBucketRateLimiter(cfg.QPS, cfg.Burst)
	}
	return cfg
}

// Admission maintenance must not queue behind Package writes or informer relists.
func admissionClientConfig(base *rest.Config) *rest.Config {
	cfg := rest.CopyConfig(base)
	cfg.QPS, cfg.Burst = 10, 20
	cfg.RateLimiter = flowcontrol.NewTokenBucketRateLimiter(cfg.QPS, cfg.Burst)
	// Watches must outlive an individual reconciliation deadline. Serving
	// initialization and synchronization bound their own request contexts.
	cfg.Timeout = 0
	return cfg
}
