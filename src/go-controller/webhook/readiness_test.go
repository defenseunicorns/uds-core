// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package webhook

import (
	"context"
	"crypto/tls"
	"testing"
)

func TestAdmissionReadinessRequiresLiveServingAndTrust(t *testing.T) {
	previous := admissionState.Swap(nil)
	defer admissionState.Store(previous)
	if AdmissionReady() {
		t.Fatal("unstarted backend reported Ready")
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	manager := &ServingManager{}
	state := &admissionServingState{manager: manager, ctx: ctx}
	admissionState.Store(state)
	manager.certificate.Store(&tls.Certificate{})
	manager.ready.Store(true)
	if AdmissionReady() {
		t.Fatal("unbound listener reported Ready")
	}
	state.listening.Store(true)
	if !AdmissionReady() {
		t.Fatal("live trusted backend did not report Ready")
	}
	manager.ready.Store(false)
	if AdmissionReady() {
		t.Fatal("unsynchronized serving trust reported Ready")
	}
	manager.ready.Store(true)
	manager.certificate.Store(nil)
	if AdmissionReady() {
		t.Fatal("missing serving certificate reported Ready")
	}
	manager.certificate.Store(&tls.Certificate{})
	state.listening.Store(false)
	if AdmissionReady() {
		t.Fatal("stopped listener reported Ready")
	}
	state.listening.Store(true)
	cancel()
	if AdmissionReady() {
		t.Fatal("revoked serving context reported Ready")
	}
}
