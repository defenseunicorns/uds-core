// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package policies

import (
	"encoding/json"
	"os"
	"testing"
)

func TestPinnedCoreDiagnosticJSONParity(t *testing.T) {
	raw, err := os.ReadFile("testdata/core-diagnostic-parity.json")
	if err != nil {
		t.Fatal(err)
	}
	var fixture struct {
		SourceRevision string
		Cases          []struct {
			Annotation, Expected string
			AlreadyDefaulted     bool
			Failed               bool
		}
	}
	if err := json.Unmarshal(raw, &fixture); err != nil {
		t.Fatal(err)
	}
	if fixture.SourceRevision != "c15677633cffa17e99656a7d7ccd1f98d7cb6e4d" || len(fixture.Cases) != 40 {
		t.Fatal("pinned diagnostic source fixture is incomplete")
	}
	for _, test := range fixture.Cases {
		t.Run(test.Annotation, func(t *testing.T) {
			diagnostics, err := parseDiagnostics(test.Annotation)
			if (err != nil) != test.Failed {
				t.Fatalf("error differs from Core: %v", err)
			}
			if err != nil {
				return
			}
			if !test.AlreadyDefaulted {
				diagnostics.add("disallow-privileged")
			}
			diagnostics.add("require-non-root-user")
			diagnostics.add("drop-all-capabilities")
			if actual := diagnostics.text(); actual != test.Expected {
				t.Fatalf("diagnostic differs: got %q source %q", actual, test.Expected)
			}
		})
	}
}
