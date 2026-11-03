// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
package resources

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestExemptionRejectsNonRE2AtWriteTime(t *testing.T) {
	for _, pattern := range []string{"(?=app)app", "(?<=prefix)app", "(app)-\\1", "["} {
		raw, _ := json.Marshal(map[string]interface{}{
			"metadata": map[string]interface{}{"name": "grant", "namespace": "uds-policy-exemptions"},
			"spec":     map[string]interface{}{"exemptions": []interface{}{map[string]interface{}{"matcher": map[string]interface{}{"namespace": "app", "name": pattern, "kind": "pod"}, "policies": []string{"DisallowPrivileged"}}}},
		})
		object, _ := Decode(raw)
		message := ValidateExemption(object, false)
		for _, part := range []string{"uds-policy-exemptions/grant", "matcher[0]", "RE2", "https://github.com/google/re2/wiki/Syntax"} {
			if !strings.Contains(message, part) {
				t.Errorf("%q missing from %q", part, message)
			}
		}
	}
}
