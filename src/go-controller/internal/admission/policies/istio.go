// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package policies

import (
	"fmt"
	"sort"
	"strings"

	"github.com/defenseunicorns/uds-core/src/go-controller/internal/admission/resources"
)

func istioUser(pod resources.Object) string {
	ctx := pod.Object("spec").Object("securityContext")
	if ctx.Number("runAsUser") == 1337 || ctx.Number("runAsGroup") == 1337 || ctx.Number("fsGroup") == 1337 || HasNumber(ctx.Numbers("supplementalGroups"), 1337) {
		return "Pods cannot use UID/GID 1337 (Istio proxy) unless they are trusted Istio components"
	}
	for _, container := range Containers(pod) {
		ctx := container.Object("securityContext")
		if !IsIstioProxy(container) && (ctx.Number("runAsUser") == 1337 || ctx.Number("runAsGroup") == 1337) {
			return fmt.Sprintf("Container '%s' cannot use UID/GID 1337 (Istio proxy) as it is not a trusted Istio component", container.String("name"))
		}
	}
	return ""
}

func trafficOverrides(pod resources.Object) string {
	metadata := pod.Object("metadata")
	namespace := defaultNamespace(metadata.String("namespace"))
	annotations, labels := metadata.Object("annotations"), metadata.Object("labels")
	blocked := []string{"sidecar.istio.io/inject", "traffic.sidecar.istio.io/excludeInboundPorts", "traffic.sidecar.istio.io/excludeInterfaces", "traffic.sidecar.istio.io/excludeOutboundIPRanges", "traffic.sidecar.istio.io/excludeOutboundPorts", "traffic.sidecar.istio.io/includeInboundPorts", "traffic.sidecar.istio.io/includeOutboundIPRanges", "traffic.sidecar.istio.io/includeOutboundPorts", "sidecar.istio.io/interceptionMode", "traffic.sidecar.istio.io/kubevirtInterfaces", "istio.io/redirect-virtual-interfaces"}
	var violations []string
	for _, key := range blocked {
		if !annotations.Has(key) {
			continue
		}
		if key == "sidecar.istio.io/inject" && (namespace == "istio-system" || strings.TrimFunc(annotations.String(key), jsWhitespace) == "true") {
			continue
		}
		violations = append(violations, "annotation "+key)
	}
	waypoint := false
	for _, container := range Containers(pod) {
		waypoint = waypoint || IsIstioProxy(container) && HasString(container.Strings("args"), "waypoint")
	}
	if labels.Has("sidecar.istio.io/inject") && namespace != "istio-system" && strings.TrimFunc(labels.String("sidecar.istio.io/inject"), jsWhitespace) != "true" && !waypoint {
		violations = append(violations, "label sidecar.istio.io/inject")
	}
	sort.Strings(violations)
	if len(violations) > 0 {
		return "The following istio annotations or labels can modify secure traffic interception are not allowed: " + strings.Join(violations, ", ")
	}
	return ""
}

func defaultNamespace(namespace string) string {
	if namespace == "" {
		return "default"
	}
	return namespace
}
