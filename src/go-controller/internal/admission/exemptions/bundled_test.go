// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
package exemptions

import (
	"os"
	"regexp"
	"sigs.k8s.io/yaml"
	"strings"
	"testing"
)

// Exercise the shipped grant, including every possible first mismatch against
// the excluded prefix. Do not broaden Falco privileges to falcosidekick.
func TestBundledFalcoMatcherPreservesExclusion(t *testing.T) {
	raw, err := os.ReadFile("../../../../falco/chart/templates/uds-exemption.yaml")
	if err != nil {
		t.Fatal(err)
	}
	var object struct {
		Spec struct {
			Exemptions []struct{ Matcher struct{ Name string } }
		}
	}
	if err := yaml.Unmarshal(raw, &object); err != nil {
		t.Fatal(err)
	}
	expression, err := regexp.Compile(object.Spec.Exemptions[0].Matcher.Name)
	if err != nil {
		t.Fatal(err)
	}
	excluded := "falcosidekick-"
	names := []string{"falco-", "falco-abc12", "falco-driver-loader-abc", "falco-falcosidekick-abc", "falco-falcosidekick-ui-abc", "ordinary", "falcosidekick-abc"}
	for i := 0; i <= len(excluded); i++ {
		names = append(names, "falco-"+excluded[:i])
		for _, c := range "abcdefghijklmnopqrstuvwxyz0123456789-." {
			names = append(names, "falco-"+excluded[:i]+string(c)+"-abc12")
		}
	}
	for _, name := range names {
		for _, prefix := range []string{"", "tenant-"} {
			name := prefix + name
			// Equivalent search semantics for DNS resource names, without a JS engine.
			expected := false
			for rest := name; ; {
				i := strings.Index(rest, "falco-")
				if i < 0 {
					break
				}
				rest = rest[i+len("falco-"):]
				if !strings.HasPrefix(rest, excluded) {
					expected = true
					break
				}
			}
			if got := expression.MatchString(name); got != expected {
				t.Errorf("%q: got %v want %v", name, got, expected)
			}
		}
	}
}
