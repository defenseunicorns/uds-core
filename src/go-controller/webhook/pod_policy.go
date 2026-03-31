// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package webhook

import (
	"encoding/json"
	"fmt"
	"strconv"
	"strings"

	corev1 "k8s.io/api/core/v1"
)

// isRootPodSecurityContext checks if a pod-level security context represents root access.
func isRootPodSecurityContext(ctx *corev1.PodSecurityContext) bool {
	if ctx == nil {
		return false
	}
	if ctx.RunAsNonRoot != nil && !*ctx.RunAsNonRoot {
		return true
	}
	if ctx.RunAsUser != nil && *ctx.RunAsUser == 0 {
		return true
	}
	for _, g := range ctx.SupplementalGroups {
		if g == 0 {
			return true
		}
	}
	return false
}

// isRootContainerSecurityContext checks if a container-level security context represents root access.
func isRootContainerSecurityContext(ctx *corev1.SecurityContext) bool {
	if ctx == nil {
		return false
	}
	if ctx.RunAsNonRoot != nil && !*ctx.RunAsNonRoot {
		return true
	}
	if ctx.RunAsUser != nil && *ctx.RunAsUser == 0 {
		return true
	}
	return false
}

type containerViolation struct {
	Name string      `json:"name"`
	Ctx  interface{} `json:"ctx"`
}

// validateNonRootUser checks a pod for root security contexts.
// Returns (allowed, message).
func validateNonRootUser(pod *corev1.Pod) (bool, string) {
	// Check pod-level security context
	if isRootPodSecurityContext(pod.Spec.SecurityContext) {
		return false, "Pod level securityContext does not meet the non-root user requirement."
	}

	// Check all containers
	var violations []containerViolation
	allContainers := collectContainers(pod)
	for _, c := range allContainers {
		if c.ctx != nil && isRootContainerSecurityContext(c.ctx) {
			violations = append(violations, containerViolation{
				Name: c.name,
				Ctx:  c.ctx,
			})
		}
	}

	if len(violations) > 0 {
		return false, formatViolationMessage(violations)
	}

	return true, ""
}

type namedSecurityContext struct {
	name string
	ctx  *corev1.SecurityContext
}

func collectContainers(pod *corev1.Pod) []namedSecurityContext {
	var result []namedSecurityContext
	for _, c := range pod.Spec.Containers {
		result = append(result, namedSecurityContext{name: c.Name, ctx: c.SecurityContext})
	}
	for _, c := range pod.Spec.InitContainers {
		if isIstioInitContainer(pod, &c) {
			continue
		}
		result = append(result, namedSecurityContext{name: c.Name, ctx: c.SecurityContext})
	}
	for _, c := range pod.Spec.EphemeralContainers {
		result = append(result, namedSecurityContext{name: c.Name, ctx: c.SecurityContext})
	}
	return result
}

// isIstioInitContainer mirrors pepr's logic: skip istio-init when the pod has the
// sidecar.istio.io/status annotation, has an istio-proxy in initContainers (native
// sidecar mode), and the container is the known istio-init iptables container.
func isIstioInitContainer(pod *corev1.Pod, c *corev1.Container) bool {
	if _, ok := pod.Annotations["sidecar.istio.io/status"]; !ok {
		return false
	}
	// Native sidecar mode: istio-proxy appears as an init container
	hasSidecar := false
	for _, ic := range pod.Spec.InitContainers {
		if isIstioProxyContainer(&ic) {
			hasSidecar = true
			break
		}
	}
	if !hasSidecar {
		return false
	}
	return c.Name == "istio-init" &&
		len(c.Args) > 0 && c.Args[0] == "istio-iptables" &&
		len(c.Command) == 0
}

// isIstioProxyContainer mirrors pepr's logic: name is istio-proxy, has the
// http-envoy-prom port, args[0] is "proxy", and no explicit command.
func isIstioProxyContainer(c *corev1.Container) bool {
	if c.Name != "istio-proxy" {
		return false
	}
	hasPromPort := false
	for _, p := range c.Ports {
		if p.Name == "http-envoy-prom" {
			hasPromPort = true
			break
		}
	}
	return hasPromPort && len(c.Args) > 0 && c.Args[0] == "proxy" && len(c.Command) == 0
}

func formatViolationMessage(violations []containerViolation) string {
	parts := make([]string, 0, len(violations))
	for _, v := range violations {
		b, _ := json.Marshal(v)
		parts = append(parts, string(b))
	}
	return fmt.Sprintf(
		"Unauthorized container securityContext. Containers must not run as root or have root-level supplemental groups. Authorized: [runAsNonRoot = true | runAsUser > 0 | supplementalGroups must not include 0] Found: %s",
		strings.Join(parts, " | "),
	)
}

// jsonPatchOp represents a single JSON Patch operation (RFC 6902).
type jsonPatchOp struct {
	Op    string      `json:"op"`
	Path  string      `json:"path"`
	Value interface{} `json:"value,omitempty"`
}

// setNonRootUserDefaults generates JSON Patch ops to set safe defaults on a pod.
func setNonRootUserDefaults(pod *corev1.Pod) []jsonPatchOp {
	var patches []jsonPatchOp

	labels := pod.Labels
	if labels == nil {
		labels = map[string]string{}
	}

	// Ensure securityContext exists
	if pod.Spec.SecurityContext == nil {
		patches = append(patches, jsonPatchOp{Op: "add", Path: "/spec/securityContext", Value: map[string]interface{}{}})
	}

	// Read label overrides
	userLabel, hasUserLabel := labels["uds/user"]
	groupLabel, hasGroupLabel := labels["uds/group"]
	fsgroupLabel, hasFSGroupLabel := labels["uds/fsgroup"]

	// Apply label overrides (these always apply if the label exists)
	if hasUserLabel {
		if v, err := strconv.ParseInt(userLabel, 10, 64); err == nil {
			patches = append(patches, jsonPatchOp{Op: "add", Path: "/spec/securityContext/runAsUser", Value: v})
		}
	}
	if hasGroupLabel {
		if v, err := strconv.ParseInt(groupLabel, 10, 64); err == nil {
			patches = append(patches, jsonPatchOp{Op: "add", Path: "/spec/securityContext/runAsGroup", Value: v})
		}
	}
	if hasFSGroupLabel {
		if v, err := strconv.ParseInt(fsgroupLabel, 10, 64); err == nil {
			patches = append(patches, jsonPatchOp{Op: "add", Path: "/spec/securityContext/fsGroup", Value: v})
		}
	}

	sc := pod.Spec.SecurityContext

	// Set defaults only if not already set and no label override
	if sc == nil || sc.RunAsNonRoot == nil {
		patches = append(patches, jsonPatchOp{Op: "add", Path: "/spec/securityContext/runAsNonRoot", Value: true})
	}
	if !hasUserLabel && (sc == nil || sc.RunAsUser == nil) {
		patches = append(patches, jsonPatchOp{Op: "add", Path: "/spec/securityContext/runAsUser", Value: int64(1000)})
	}
	if !hasGroupLabel && (sc == nil || sc.RunAsGroup == nil) {
		patches = append(patches, jsonPatchOp{Op: "add", Path: "/spec/securityContext/runAsGroup", Value: int64(1000)})
	}

	return patches
}
