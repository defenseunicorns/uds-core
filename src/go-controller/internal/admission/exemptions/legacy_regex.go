// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package exemptions

import (
	"fmt"
	"github.com/dlclark/regexp2/v2"
	"github.com/dop251/goja"
	"time"
)

// Only legacy platform-authored regular expressions use this Go-hosted engine.
// Core controller/policy TypeScript is never executed. Native-safe expressions
// stay in CEL. Input is a string argument, never concatenated into JavaScript.
var regexConstructor = goja.MustCompile("uds-exemption-regex", "new RegExp(pattern)", false)
var regexMatch = goja.MustCompile("uds-exemption-match", "new RegExp(pattern).test(resourceName)", false)

func init() { regexp2.DefaultMatchTimeout = 50 * time.Millisecond }

func validateJSRegex(pattern string) error {
	vm := goja.New()
	if err := vm.Set("pattern", pattern); err != nil {
		return err
	}
	_, err := vm.RunProgram(regexConstructor)
	return err
}

func MatchLegacy(pattern, name string) (bool, error) {
	if len(name) > 253 {
		return false, fmt.Errorf("exemption resource name exceeds Kubernetes bound")
	}
	vm := goja.New()
	if err := vm.Set("pattern", pattern); err != nil {
		return false, err
	}
	if err := vm.Set("resourceName", name); err != nil {
		return false, err
	}
	timer := time.AfterFunc(100*time.Millisecond, func() { vm.Interrupt("exemption evaluation deadline") })
	defer timer.Stop()
	value, err := vm.RunProgram(regexMatch)
	if err != nil {
		return false, fmt.Errorf("legacy exemption match: %w", err)
	}
	return value.ToBoolean(), nil
}
