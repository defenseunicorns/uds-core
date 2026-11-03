// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

// Package decisionmetrics exposes bounded-cardinality admission observations.
package decisionmetrics

import "github.com/prometheus/client_golang/prometheus"

var Decisions = prometheus.NewCounterVec(prometheus.CounterOpts{Name: "uds_admission_decisions_total", Help: "Go admission decisions by handler, allowed result, and policy"}, []string{"handler", "allowed", "policy"})
