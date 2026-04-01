// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package webhook

import corev1 "k8s.io/api/core/v1"

const istioUID int64 = 1337

// isPodUsingIstioUserID checks if the pod-level security context uses UID/GID 1337.
func isPodUsingIstioUserID(podCtx *corev1.PodSecurityContext) bool {
	if podCtx == nil {
		return false
	}
	if podCtx.RunAsUser != nil && *podCtx.RunAsUser == istioUID {
		return true
	}
	if podCtx.RunAsGroup != nil && *podCtx.RunAsGroup == istioUID {
		return true
	}
	if podCtx.FSGroup != nil && *podCtx.FSGroup == istioUID {
		return true
	}
	for _, g := range podCtx.SupplementalGroups {
		if g == istioUID {
			return true
		}
	}
	return false
}

// findContainerUsingIstioUserID returns the name of the first non-Istio-proxy container
// that uses UID/GID 1337, or empty string if none found.
func findContainerUsingIstioUserID(containers []corev1.Container) string {
	for _, c := range containers {
		if isIstioProxyContainer(&c) {
			continue
		}
		ctx := c.SecurityContext
		if ctx == nil {
			continue
		}
		if (ctx.RunAsUser != nil && *ctx.RunAsUser == istioUID) ||
			(ctx.RunAsGroup != nil && *ctx.RunAsGroup == istioUID) {
			return c.Name
		}
	}
	return ""
}

// validateIstioUser checks that UID/GID 1337 is only used by trusted Istio components.
// Returns (allowed, message).
func validateIstioUser(pod *corev1.Pod) (bool, string) {
	if isPodUsingIstioUserID(pod.Spec.SecurityContext) {
		return false, "Pods cannot use UID/GID 1337 (Istio proxy) unless they are trusted Istio components"
	}

	allContainers := append(pod.Spec.Containers, pod.Spec.InitContainers...)
	name := findContainerUsingIstioUserID(allContainers)
	if name != "" {
		return false, "Container '" + name + "' cannot use UID/GID 1337 (Istio proxy) as it is not a trusted Istio component"
	}

	return true, ""
}
