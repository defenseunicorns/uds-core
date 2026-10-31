// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package controller

import (
	"context"
	"errors"
	"testing"

	"github.com/defenseunicorns/uds-core/src/go-controller/internal/featureflags"
	"k8s.io/client-go/rest"
)

var phaseEnvironment = []string{
	"UDS_OPERATOR_NETWORK_POLICIES_ENABLED", "UDS_OPERATOR_AUTHORIZATION_POLICIES_ENABLED",
	"UDS_OPERATOR_ISTIO_INJECTION_ENABLED", "UDS_OPERATOR_ISTIO_INGRESS_ENABLED", "UDS_OPERATOR_ISTIO_EGRESS_ENABLED",
	"UDS_OPERATOR_SSO_ENABLED", "UDS_OPERATOR_POD_MONITORS_ENABLED", "UDS_OPERATOR_SERVICE_MONITORS_ENABLED",
	"UDS_OPERATOR_UPTIME_PROBES_ENABLED", "UDS_OPERATOR_CA_BUNDLE_ENABLED",
}

func phaseStartupEnvironment(t *testing.T, mode, phaseValue string) {
	t.Helper()
	t.Setenv("UDS_CONTROLLER_MODE", mode)
	t.Setenv("KUBERNETES_SERVICE_HOST", "")
	t.Setenv("KUBERNETES_SERVICE_PORT", "")
	for _, name := range phaseEnvironment {
		t.Setenv(name, phaseValue)
	}
}

func TestPartialOwnershipFailsBeforeCredentialOrClientInitialization(t *testing.T) {
	for _, missing := range phaseEnvironment {
		t.Run(missing, func(t *testing.T) {
			phaseStartupEnvironment(t, "", "false")
			t.Setenv(missing, "true")
			if _, err := NewControllerWithOptions(context.Background(), DefaultRunOptions()); !errors.Is(err, featureflags.ErrIncompleteOwnership) {
				t.Fatalf("constructor passed partial ownership to credential loading: %v", err)
			}
			// A directly constructed controller must reject the same mode before
			// dereferencing its configuration or creating any Kubernetes clients.
			if err := (&Controller{}).Run(context.Background()); !errors.Is(err, featureflags.ErrIncompleteOwnership) {
				t.Fatalf("Run accepted partial writer: %v", err)
			}
		})
	}
}

func TestNoOwnershipDoesNotImplicitlyStartAdmissionOnly(t *testing.T) {
	phaseStartupEnvironment(t, "", "")
	if _, err := NewController(context.Background()); !errors.Is(err, featureflags.ErrIncompleteOwnership) {
		t.Fatalf("unconfigured phase selection started a writer: %v", err)
	}
}

func TestEffectiveFullOwnershipReachesNormalStartup(t *testing.T) {
	for _, mode := range []string{"native", "legacy-all"} {
		t.Run(mode, func(t *testing.T) {
			if mode == "native" {
				// The chart's explicit native mode remains authoritative over
				// individual flag values, and always enables every phase.
				phaseStartupEnvironment(t, "native", "true")
			} else {
				phaseStartupEnvironment(t, "", "false")
			}
			if err := featureflags.Load().ValidateOwnership(); err != nil {
				t.Fatal(err)
			}
			if _, err := NewControllerWithOptions(context.Background(), DefaultRunOptions()); !errors.Is(err, rest.ErrNotInCluster) {
				t.Fatalf("full mode did not reach normal in-cluster startup: %v", err)
			}
		})
	}
}
