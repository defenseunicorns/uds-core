// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package webhook

import (
	"context"
	"sync/atomic"
)

type admissionServingState struct {
	manager   *ServingManager
	ctx       context.Context
	listening atomic.Bool
}

var admissionState atomic.Pointer[admissionServingState]

// AdmissionReady reports this replica's actual live HTTPS serving readiness.
// It does not infer health from the process, Deployment or desired registration.
func AdmissionReady() bool {
	state := admissionState.Load()
	return state != nil && state.ctx.Err() == nil && state.listening.Load() && state.manager.ready.Load() && state.manager.certificate.Load() != nil
}

// AdmissionRegistered distinguishes a dormant Ready backend from the nine
// expected fail-closed callbacks targeting this live, trust-converged backend.
func AdmissionRegistered() bool {
	state := admissionState.Load()
	return AdmissionReady() && state != nil && state.manager.registered.Load()
}
