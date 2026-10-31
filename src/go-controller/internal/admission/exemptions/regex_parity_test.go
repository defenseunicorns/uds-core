// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package exemptions

import (
	"encoding/json"
	"os"
	"regexp"
	"testing"
)

func TestJavaScriptRegexDifferential(t *testing.T) {
	raw, err := os.ReadFile("testdata/javascript-regex-parity.json")
	if err != nil {
		t.Fatal(err)
	}
	var fixture struct {
		SourceRevision, Runtime string
		Cases                   []struct {
			Pattern, Name                  string
			Valid, Matched, KubernetesName bool
		}
	}
	if err := json.Unmarshal(raw, &fixture); err != nil {
		t.Fatal(err)
	}
	if fixture.SourceRevision != "c15677633cffa17e99656a7d7ccd1f98d7cb6e4d" || len(fixture.Cases) != 1008 {
		t.Fatal("missing pinned differential corpus")
	}
	for _, test := range fixture.Cases {
		t.Run(test.Pattern+"/"+test.Name, func(t *testing.T) {
			err := ValidatePattern(test.Pattern)
			if (err == nil) != test.Valid {
				t.Fatalf("constructor differs from %s: %v, expected valid=%t", fixture.Runtime, err, test.Valid)
			}
			if !test.Valid {
				return
			}
			matched, err := MatchLegacy(test.Pattern, test.Name)
			if err != nil {
				t.Fatal(err)
			}
			if matched != test.Matched {
				t.Errorf("legacy match differs: got %t expected %t", matched, test.Matched)
			}
			// Kubernetes resource names are ASCII DNS names. Native RE2 is
			// qualified at that exact boundary, while JS fallback covers the
			// complete corpus, including JS code-unit and escape semantics.
			if test.KubernetesName && IsNativePattern(test.Pattern) {
				compiled, err := regexp.Compile(test.Pattern)
				if err != nil {
					t.Fatal(err)
				}
				if compiled.MatchString(test.Name) != test.Matched {
					t.Fatal("native subset changed JavaScript matching")
				}
			}
		})
	}
}
