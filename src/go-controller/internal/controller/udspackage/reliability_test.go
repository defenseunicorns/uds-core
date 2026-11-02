// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package udspackage

import (
	"context"
	"errors"
	udstypes "github.com/defenseunicorns/uds-core/src/go-controller/api/uds/v1alpha1"
	"github.com/defenseunicorns/uds-core/src/go-controller/internal/featureflags"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"testing"
	"time"
)

func TestNamespaceSerializationDoesNotBlockOtherNamespaces(t *testing.T) {
	var locks namespaceLocks
	release, err := locks.acquire(context.Background(), "one")
	if err != nil {
		t.Fatal(err)
	}
	defer release()
	second, err := locks.acquire(context.Background(), "two")
	if err != nil {
		t.Fatal(err)
	}
	second()
	ctx, cancel := context.WithTimeout(context.Background(), time.Millisecond)
	defer cancel()
	if _, err := locks.acquire(ctx, "one"); !errors.Is(err, context.DeadlineExceeded) {
		t.Fatal("same namespace not serialized", err)
	}
}
func TestRetryWindowAndEvents(t *testing.T) {
	limiter := packageRetryLimiter()
	total := time.Duration(0)
	for i := 0; i < 4; i++ {
		total += limiter.When("apps/app")
	}
	if total != 2*time.Minute {
		t.Fatalf("retry window: %v", total)
	}
	limiter.Forget("apps/app")
	if limiter.When("apps/app") != 8*time.Second {
		t.Fatal("retry state not reset")
	}
	pkg := &udstypes.UDSPackage{ObjectMeta: metav1.ObjectMeta{Name: "app", Namespace: "apps", UID: "uid"}}
	c, _, kube := fixtureController(t, pkg, featureflags.Flags{})
	// The queue delays retries without occupying a worker for the recovery window.
	for i := 0; i < 4; i++ {
		if err := c.handleFailure(context.Background(), pkg, errors.New("unavailable"), 0); err == nil {
			t.Fatal("missing retry")
		}
	}
	if err := c.handleFailure(context.Background(), pkg, errors.New("unavailable"), 0); err != nil {
		t.Fatal(err)
	}
	count := 0
	for _, action := range kube.Actions() {
		if action.GetVerb() == "create" && action.GetResource().Resource == "events" {
			count++
		}
	}
	if count != 5 {
		t.Fatalf("Event creation attempts: %d", count)
	}

	if *pkg.Status.Phase != udstypes.PhaseFailed {
		t.Fatal("retry budget not exhausted")
	}
}
func TestReadyTransitionTimeOnlyChangesOnTransition(t *testing.T) {
	old := readinessConditions(false)
	old[0].LastTransitionTime = metav1.NewTime(time.Unix(10, 0))
	same := readinessConditions(false, old...)
	if !same[0].LastTransitionTime.Equal(&old[0].LastTransitionTime) {
		t.Fatal("status refresh changed transition time")
	}
	changed := readinessConditions(true, old...)
	if changed[0].LastTransitionTime.Equal(&old[0].LastTransitionTime) {
		t.Fatal("transition time not advanced")
	}
}
