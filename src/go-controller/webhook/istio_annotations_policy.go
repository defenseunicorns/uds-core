// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package webhook

import (
	"fmt"
	"sort"
	"strings"

	corev1 "k8s.io/api/core/v1"
)

// Blocked sidecar annotations that can override secure sidecar behavior.
var blockedSidecarAnnotations = map[string]bool{
	"sidecar.istio.io/bootstrapOverride": true,
	"sidecar.istio.io/discoveryAddress":  true,
	"sidecar.istio.io/proxyImage":        true,
	"proxy.istio.io/config":              true,
	"sidecar.istio.io/userVolume":        true,
	"sidecar.istio.io/userVolumeMount":   true,
}

// Blocked traffic annotations that can modify traffic interception.
var blockedTrafficAnnotations = map[string]bool{
	"sidecar.istio.io/inject":                          true,
	"traffic.sidecar.istio.io/excludeInboundPorts":     true,
	"traffic.sidecar.istio.io/excludeInterfaces":       true,
	"traffic.sidecar.istio.io/excludeOutboundIPRanges": true,
	"traffic.sidecar.istio.io/excludeOutboundPorts":    true,
	"traffic.sidecar.istio.io/includeInboundPorts":     true,
	"traffic.sidecar.istio.io/includeOutboundIPRanges": true,
	"traffic.sidecar.istio.io/includeOutboundPorts":    true,
	"sidecar.istio.io/interceptionMode":                true,
	"traffic.sidecar.istio.io/kubevirtInterfaces":      true,
	"istio.io/redirect-virtual-interfaces":             true,
}

// Blocked traffic labels.
var blockedTrafficLabels = map[string]bool{
	"sidecar.istio.io/inject": true,
}

// Blocked ambient annotations.
var blockedAmbientAnnotations = map[string]bool{
	"ambient.istio.io/bypass-inbound-capture": true,
}

// checkIstioSidecarOverrides returns a sorted list of blocked sidecar annotations found on the pod.
func checkIstioSidecarOverrides(pod *corev1.Pod) []string {
	annotations := pod.Annotations
	if len(annotations) == 0 {
		return nil
	}
	var violations []string
	for key := range annotations {
		if blockedSidecarAnnotations[key] {
			violations = append(violations, key)
		}
	}
	sort.Strings(violations)
	return violations
}

// validateIstioSidecarOverrides checks that no blocked sidecar annotations are present.
func validateIstioSidecarOverrides(pod *corev1.Pod) (bool, string) {
	violations := checkIstioSidecarOverrides(pod)
	if len(violations) > 0 {
		return false, fmt.Sprintf(
			"The following istio annotations can modify secure sidecar configuration and are not allowed: %s",
			strings.Join(violations, ", "),
		)
	}
	return true, ""
}

// isWaypointPod checks if any container is an istio-proxy running as a waypoint.
func isWaypointPod(containers []corev1.Container) bool {
	for _, c := range containers {
		if !isIstioProxyContainer(&c) {
			continue
		}
		for _, arg := range c.Args {
			if arg == "waypoint" {
				return true
			}
		}
	}
	return false
}

// checkIstioTrafficOverrides returns a sorted list of blocked traffic annotations/labels found on the pod.
func checkIstioTrafficOverrides(pod *corev1.Pod) []string {
	namespace := pod.Namespace
	if namespace == "" {
		namespace = "default"
	}
	annotations := pod.Annotations
	labels := pod.Labels

	var violations []string

	// Check annotations
	for key, val := range annotations {
		if !blockedTrafficAnnotations[key] {
			continue
		}
		// sidecar.istio.io/inject is allowed in istio-system or when value is "true"
		if key == "sidecar.istio.io/inject" {
			if namespace == "istio-system" || strings.TrimSpace(val) == "true" {
				continue
			}
		}
		violations = append(violations, "annotation "+key)
	}

	// Check labels
	waypoint := isWaypointPod(append(pod.Spec.Containers, pod.Spec.InitContainers...))
	for key, val := range labels {
		if !blockedTrafficLabels[key] {
			continue
		}
		if key == "sidecar.istio.io/inject" {
			if namespace == "istio-system" || strings.TrimSpace(val) == "true" || waypoint {
				continue
			}
		}
		violations = append(violations, "label "+key)
	}

	sort.Strings(violations)
	return violations
}

// validateIstioTrafficOverrides checks that no blocked traffic annotations/labels are present.
func validateIstioTrafficOverrides(pod *corev1.Pod) (bool, string) {
	violations := checkIstioTrafficOverrides(pod)
	if len(violations) > 0 {
		return false, fmt.Sprintf(
			"The following istio annotations or labels can modify secure traffic interception are not allowed: %s",
			strings.Join(violations, ", "),
		)
	}
	return true, ""
}

// checkIstioAmbientOverrides returns a sorted list of blocked ambient annotations found on the pod.
func checkIstioAmbientOverrides(pod *corev1.Pod) []string {
	annotations := pod.Annotations
	if len(annotations) == 0 {
		return nil
	}
	var violations []string
	for key := range annotations {
		if blockedAmbientAnnotations[key] {
			violations = append(violations, key)
		}
	}
	sort.Strings(violations)
	return violations
}

// validateIstioAmbientOverrides checks that no blocked ambient annotations are present.
func validateIstioAmbientOverrides(pod *corev1.Pod) (bool, string) {
	violations := checkIstioAmbientOverrides(pod)
	if len(violations) > 0 {
		return false, fmt.Sprintf(
			"The following istio ambient annotations that can modify secure mesh behavior are not allowed: %s",
			strings.Join(violations, ", "),
		)
	}
	return true, ""
}
