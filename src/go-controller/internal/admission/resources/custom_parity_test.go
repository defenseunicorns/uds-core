// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package resources

import (
	"encoding/json"
	"os"
	"strings"
	"testing"
)

func TestPinnedCustomResourceValidatorParity(t *testing.T) {
	raw, err := os.ReadFile("testdata/custom-resource-parity.json")
	if err != nil {
		t.Fatal(err)
	}
	var fixture struct {
		SourceRevision string
		Cases          []struct {
			Name, Kind, Message string
			Object              json.RawMessage
			Allowed, AllowAll   bool
		}
	}
	if err := json.Unmarshal(raw, &fixture); err != nil {
		t.Fatal(err)
	}
	if fixture.SourceRevision != "c15677633cffa17e99656a7d7ccd1f98d7cb6e4d" || len(fixture.Cases) != 17 {
		t.Fatalf("incomplete custom-resource reference: %d", len(fixture.Cases))
	}
	for _, test := range fixture.Cases {
		t.Run(test.Kind+"/"+test.Name, func(t *testing.T) {
			object, err := Decode(test.Object)
			if err != nil {
				t.Fatal(err)
			}
			message := ValidateClusterConfig(object)
			if test.Kind == "Exemption" {
				message = ValidateExemption(object, test.AllowAll)
			}
			if (message == "") != test.Allowed {
				t.Fatalf("decision differs: Go %q, reference %q", message, test.Message)
			}
			// OpenSSL and Go X.509, and V8 and Goja, report parser details using
			// their own error text. The resource/pattern/index diagnosis is stable.
			if strings.Contains(test.Message, "Invalid certificate at index") {
				if !strings.HasPrefix(message, "Validation failed: ClusterConfig: Invalid certificate at index 0:") {
					t.Fatal(message)
				}
				return
			}
			if strings.HasPrefix(test.Message, "Invalid regular expression pattern") {
				if !strings.HasPrefix(message, "Invalid regular expression pattern )^falco-pod*:") {
					t.Fatal(message)
				}
				return
			}
			if message != test.Message {
				t.Fatalf("diagnostic differs: Go %q, reference %q", message, test.Message)
			}
		})
	}
}
