// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package policies

import (
	"encoding/json"
	"regexp"
)

var knownDiagnostics = regexp.MustCompile(`^[ \t\r\n]*\[[ \t\r\n]*("(disallow-privileged|require-non-root-user|drop-all-capabilities)"([ \t\r\n]*,[ \t\r\n]*"(disallow-privileged|require-non-root-user|drop-all-capabilities)")*)?[ \t\r\n]*\][ \t\r\n]*$`)

type mutationDiagnostics struct{ known []string }

func parseDiagnostics(text string) (*mutationDiagnostics, error) {
	d := &mutationDiagnostics{known: []string{}}
	if !knownDiagnostics.MatchString(text) {
		return d, nil
	}
	var values []string
	if json.Unmarshal([]byte(text), &values) != nil || values == nil {
		return d, nil
	}
	for _, value := range values {
		switch value {
		case "disallow-privileged", "require-non-root-user", "drop-all-capabilities":
		default:
			return d, nil
		}
	}
	d.known = values
	return d, nil
}
func (d *mutationDiagnostics) add(value string) {
	for _, existing := range d.known {
		if existing == value {
			return
		}
	}
	d.known = append(d.known, value)
}
func (d *mutationDiagnostics) length() int { return len(d.known) }
func (d *mutationDiagnostics) text() string {
	raw, _ := json.Marshal(d.known)
	return string(raw)
}
