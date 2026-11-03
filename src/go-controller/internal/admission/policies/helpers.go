// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package policies

import (
	"encoding/json"
	"github.com/defenseunicorns/uds-core/src/go-controller/internal/admission/resources"
)

type ViolationResult struct {
	Violations     []resources.Object `json:"violations"`
	IsPodViolation bool               `json:"isPodViolation"`
}

func filterContexts(containers []resources.Object, invalid func(resources.Object) bool) []resources.Object {
	result := []resources.Object{}
	for _, container := range containers {
		if invalid(container.Object("ctx")) {
			result = append(result, container)
		}
	}
	return result
}

func PrivilegeViolations(containers []resources.Object) []resources.Object {
	return filterContexts(containers, func(ctx resources.Object) bool {
		return !ctx.Has("allowPrivilegeEscalation") || string(ctx["allowPrivilegeEscalation"]) == "null" || ctx.Bool("allowPrivilegeEscalation") || ctx.Bool("privileged")
	})
}

func ProcMountViolations(containers []resources.Object, allowed []string) ViolationResult {
	return ViolationResult{Violations: filterContexts(containers, func(ctx resources.Object) bool {
		return ctx.Truthy("procMount") && !HasString(allowed, ctx.String("procMount"))
	})}
}

func ProfileViolations(podContext resources.Object, containers []resources.Object, parent, field string, allowed []string, allowMissing bool) ViolationResult {
	invalid := func(ctx resources.Object) bool {
		if parent != "" {
			ctx = ctx.Object(parent)
		}
		if !ctx.Has(field) {
			return !allowMissing
		}
		return !HasString(allowed, ctx.String(field))
	}
	return podFirstViolations(podContext, containers, invalid)
}

func SELinuxOptionsViolations(podContext resources.Object, containers []resources.Object) ViolationResult {
	return podFirstViolations(podContext, containers, func(ctx resources.Object) bool {
		options := ctx.Object("seLinuxOptions")
		return options.Truthy("user") || options.Truthy("role")
	})
}

func podFirstViolations(podContext resources.Object, containers []resources.Object, invalid func(resources.Object) bool) ViolationResult {
	if invalid(podContext) {
		if podContext == nil {
			podContext = resources.Object{}
		}
		ctx, _ := json.Marshal(podContext)
		return ViolationResult{Violations: []resources.Object{{"name": json.RawMessage(`"pod"`), "ctx": ctx}}, IsPodViolation: true}
	}
	return ViolationResult{Violations: filterContexts(containers, invalid)}
}

func DropViolations(containers []resources.Object, required string) []resources.Object {
	return filterContexts(containers, func(ctx resources.Object) bool {
		return !HasString(ctx.Object("capabilities").Strings("drop"), required)
	})
}

func CapabilityViolations(containers []resources.Object, allowed []string) []resources.Object {
	violations := []resources.Object{}
	for _, container := range containers {
		add := container.Object("ctx").Object("capabilities").Strings("add")
		for _, capability := range add {
			if !HasString(allowed, capability) {
				ctx, _ := json.Marshal(map[string]interface{}{"capabilities": map[string]interface{}{"add": add}})
				name := container["name"]
				if container.String("name") == "" {
					name = json.RawMessage(`"unnamed"`)
				}
				violations = append(violations, resources.Object{"name": name, "ctx": ctx})
				break
			}
		}
	}
	return violations
}
