// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package controller

import (
	"context"
	"errors"
	"reflect"
	"testing"

	"github.com/defenseunicorns/uds-core/src/go-controller/internal/featureflags"
	"k8s.io/client-go/rest"
)

func TestDefaultCoreOwnsEveryPhaseWithoutASelector(t *testing.T) {
	t.Setenv("KUBERNETES_SERVICE_HOST", "")
	t.Setenv("KUBERNETES_SERVICE_PORT", "")
	t.Setenv("UDS_CONTROLLER_MODE", "")
	for _, old := range []string{"", "true", "false"} {
		t.Setenv("UDS_OPERATOR_SSO_ENABLED", old)
		if err := featureflags.Load().ValidateOwnership(); err != nil {
			t.Fatal(err)
		}
		if _, err := NewControllerWithOptions(context.Background(), DefaultRunOptions()); !errors.Is(err, rest.ErrNotInCluster) {
			t.Fatalf("default Core failed before normal credential initialization: %v", err)
		}
	}
}

func TestPartialInternalOwnershipIsRejected(t *testing.T) {
	full := featureflags.Load()
	for i := 0; i < reflect.TypeOf(full).NumField(); i++ {
		candidate := full
		value := reflect.ValueOf(&candidate).Elem()
		value.Field(i).SetBool(false)
		if !errors.Is(candidate.ValidateOwnership(), featureflags.ErrIncompleteOwnership) {
			t.Fatalf("partial phase %s was accepted", value.Type().Field(i).Name)
		}
	}
}
