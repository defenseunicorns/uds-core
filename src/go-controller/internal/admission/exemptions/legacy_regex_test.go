// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package exemptions

import "testing"

func TestLegacyJavaScriptRegexSemantics(t *testing.T) {
	cases := []struct {
		pattern, name string
		expected      bool
	}{
		{"job", "my-job-worker", true}, {"^job$", "my-job-worker", false},
		{"^job-.*$", "job-worker", true}, {"(?<=job-)worker", "job-worker", true},
		{`(job)-\1`, "job-job", true}, {`(job)-\1`, "job-other", false},
		{`\p{L}+`, "ordinary", false}, // JS without the Unicode flag treats this as an identity escape.
		{`(?<prefix>job)-\k<prefix>`, "job-job", true},
	}
	for _, test := range cases {
		t.Run(test.pattern+"/"+test.name, func(t *testing.T) {
			matched, err := MatchLegacy(test.pattern, test.name)
			if err != nil {
				t.Fatal(err)
			}
			if matched != test.expected {
				t.Fatalf("got %t, expected %t", matched, test.expected)
			}
		})
	}
	if err := validateJSRegex(`(?P<python>job)`); err == nil {
		t.Fatal("non-JavaScript regex syntax was accepted")
	}
}
