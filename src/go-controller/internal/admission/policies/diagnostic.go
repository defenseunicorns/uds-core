// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package policies

import (
	"encoding/json"
	"fmt"
	"regexp"

	"github.com/dop251/goja"
)

var knownDiagnostics = regexp.MustCompile(`^[ \t\r\n]*\[[ \t\r\n]*("(disallow-privileged|require-non-root-user|drop-all-capabilities)"([ \t\r\n]*,[ \t\r\n]*"(disallow-privileged|require-non-root-user|drop-all-capabilities)")*)?[ \t\r\n]*\][ \t\r\n]*$`)

type mutationDiagnostics struct {
	known []string
	vm    *goja.Runtime
	array *goja.Object
}

func parseDiagnostics(text string) (*mutationDiagnostics, error) {
	if text == "" {
		text = "[]"
	}
	diagnostic := &mutationDiagnostics{known: []string{}}
	if knownDiagnostics.MatchString(text) {
		return diagnostic, json.Unmarshal([]byte(text), &diagnostic.known)
	}
	// Construct validated JSON data and call only built-in array/stringify
	// operations. No user program, Core TypeScript, or callbacks execute.
	diagnostic.vm = goja.New()
	value, err := decodeDiagnosticJSON(diagnostic.vm, text)
	if err != nil || goja.IsNull(value) || goja.IsUndefined(value) || value.ToObject(diagnostic.vm).ClassName() != "Array" {
		return nil, fmt.Errorf("invalid %s annotation: expected JSON array", mutationAnnotation)
	}
	diagnostic.array = value.ToObject(diagnostic.vm)
	return diagnostic, nil
}

func (d *mutationDiagnostics) add(value string) {
	if d.vm == nil {
		for _, existing := range d.known {
			if existing == value {
				return
			}
		}
		d.known = append(d.known, value)
		return
	}
	includes, _ := goja.AssertFunction(d.array.Get("includes"))
	present, _ := includes(d.array, d.vm.ToValue(value))
	if !present.ToBoolean() {
		push, _ := goja.AssertFunction(d.array.Get("push"))
		_, _ = push(d.array, d.vm.ToValue(value))
	}
}

func (d *mutationDiagnostics) length() int {
	if d.vm == nil {
		return len(d.known)
	}
	return int(d.array.Get("length").ToInteger())
}

func (d *mutationDiagnostics) text() string {
	if d.vm == nil {
		raw, _ := json.Marshal(d.known)
		return string(raw)
	}
	stringify, _ := goja.AssertFunction(d.vm.Get("JSON").ToObject(d.vm).Get("stringify"))
	value, _ := stringify(goja.Undefined(), d.array)
	return value.String()
}
