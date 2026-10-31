// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package policies

import (
	"testing"

	"github.com/defenseunicorns/uds-core/src/go-controller/internal/admission/resources"
)

func TestServiceMarkersDoNotParsePodMutationDiagnostics(t *testing.T) {
	// Core Service mutators annotate exemptions without invoking the Pod-only
	// annotateMutation helper. An unrelated diagnostic string must stay opaque.
	object, err := resources.Decode([]byte(`{"metadata":{"annotations":{"uds-core.pepr.dev/mutated":"not-json"}},"spec":{"type":"ClusterIP"}}`))
	if err != nil {
		t.Fatal(err)
	}
	patches, err := Mutate(object, true, func(policy string) bool { return policy == "DisallowNodePortServices" })
	if err != nil {
		t.Fatal("Service admission parsed a Pod diagnostic", err)
	}
	if len(patches) != 1 || patches[0].Path != "/metadata/annotations/uds-core.pepr.dev~1uds-core-policies.DisallowNodePortServices" || patches[0].Value != "exempted" {
		t.Fatalf("Service exemption marker changed: %v", patches)
	}
	if _, err := Mutate(object, false, func(string) bool { return false }); err == nil {
		t.Fatal("Pod admission silently ignored malformed diagnostics")
	}
}
