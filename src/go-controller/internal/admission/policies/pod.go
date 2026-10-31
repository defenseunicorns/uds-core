// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package policies

import (
	"encoding/json"
	"fmt"
	"sort"
	"strings"

	"github.com/defenseunicorns/uds-core/src/go-controller/internal/admission/resources"
)

// Validate evaluates one policy. Native CEL owns the ordinary admission path;
// this complete implementation owns delegated image/sidecar and JS-regex scopes.
func Validate(policy string, pod resources.Object) string {
	spec := pod.Object("spec")
	switch policy {
	case "DisallowHostNamespaces":
		if spec.Bool("hostNetwork") || spec.Bool("hostIPC") || spec.Bool("hostPID") {
			return "Sharing the host namespaces is disallowed. The fields spec.hostNetwork, spec.hostIPC, and spec.hostPID must not be set to true."
		}
	case "RestrictHostPorts":
		for _, container := range Containers(pod) {
			for _, port := range container.List("ports") {
				if port.Truthy("hostPort") {
					return "Host ports are not allowed."
				}
			}
		}
	case "RequireNonRootUser":
		if IsRoot(spec.Object("securityContext")) {
			return "Pod level securityContext does not meet the non-root user requirement."
		}
		return validateContexts(pod, true, "Unauthorized container securityContext. Containers must not run as root or have root-level supplemental groups", []string{"runAsNonRoot = true", "runAsUser > 0", "supplementalGroups must not include 0"}, IsRoot)
	case "DisallowPrivileged":
		violations := PrivilegeViolations(contexts(pod, false))
		if len(violations) > 0 {
			return contextMessage("Privilege escalation is disallowed", []string{"allowPrivilegeEscalation = false", "privileged = false"}, violations)
		}
	case "RestrictProcMount":
		return validateContexts(pod, false, "Unauthorized procMount type", []string{"Default"}, func(ctx resources.Object) bool {
			return ctx.Truthy("procMount") && ctx.String("procMount") != "Default"
		})
	case "RestrictSeccomp":
		return podAndContainerContexts(pod, "Unauthorized pod seccomp profile type", "Unauthorized container seccomp profile type", []string{"RuntimeDefault", "Localhost"}, func(ctx resources.Object) bool {
			profile := ctx.Object("seccompProfile")
			return profile.Has("type") && profile.String("type") != "RuntimeDefault" && profile.String("type") != "Localhost"
		})
	case "DisallowSELinuxOptions":
		return podAndContainerContexts(pod, "Unauthorized pod SELinux Options", "Unauthorized container SELinux Options", []string{"user: undefined", "role: undefined"}, func(ctx resources.Object) bool {
			seLinux := ctx.Object("seLinuxOptions")
			return seLinux.Truthy("user") || seLinux.Truthy("role")
		})
	case "RestrictSELinuxType":
		return podAndContainerContexts(pod, "Unauthorized pod SELinux type", "Unauthorized container SELinux type", []string{"container_t", "container_init_t", "container_kvm_t"}, func(ctx resources.Object) bool {
			seLinux := ctx.Object("seLinuxOptions")
			return seLinux.Has("type") && !HasString([]string{"container_t", "container_init_t", "container_kvm_t"}, seLinux.String("type"))
		})
	case "DropAllCapabilities":
		return validateContexts(pod, false, "Unauthorized container DROP capabilities in securityContext.capabilities.drop", []string{"ALL"}, func(ctx resources.Object) bool { return !HasString(ctx.Object("capabilities").Strings("drop"), "ALL") })
	case "RestrictCapabilities":
		return restrictCapabilities(pod)
	case "RestrictVolumeTypes":
		for _, volume := range spec.List("volumes") {
			kind := "unknown"
			// Volume fields are oneOf at the API boundary. Match the single
			// defined source rather than treating any allowed field as a bypass.
			for field := range volume {
				if field != "name" {
					kind = field
					break
				}
			}
			if !HasString([]string{"configMap", "csi", "downwardAPI", "emptyDir", "ephemeral", "image", "persistentVolumeClaim", "projected", "secret"}, kind) {
				return fmt.Sprintf("Volume %s has a disallowed volume type of '%s'.", volume.String("name"), kind)
			}
		}
	case "RestrictHostPathWrite":
		for _, volume := range spec.List("volumes") {
			if volume.Truthy("hostPath") {
				for _, container := range Containers(pod) {
					for _, mount := range container.List("volumeMounts") {
						if mount.Has("name") == volume.Has("name") && mount.String("name") == volume.String("name") && !mount.Bool("readOnly") {
							return fmt.Sprintf("hostPath volume '%s' must be mounted as readOnly.", volume.String("name"))
						}
					}
				}
			}
		}
	case "RestrictIstioSidecarOverrides":
		return blockedAnnotations(pod, []string{"sidecar.istio.io/bootstrapOverride", "sidecar.istio.io/discoveryAddress", "sidecar.istio.io/proxyImage", "proxy.istio.io/config", "sidecar.istio.io/userVolume", "sidecar.istio.io/userVolumeMount"}, "The following istio annotations can modify secure sidecar configuration and are not allowed: ")
	case "RestrictIstioAmbientOverrides":
		return blockedAnnotations(pod, []string{"ambient.istio.io/bypass-inbound-capture"}, "The following istio ambient annotations that can modify secure mesh behavior are not allowed: ")
	case "RestrictIstioTrafficOverrides":
		return trafficOverrides(pod)
	case "RestrictIstioUser":
		return istioUser(pod)
	case "RestrictExternalNames":
		if spec.String("type") == "ExternalName" {
			return "ExternalName services are not allowed."
		}
	case "DisallowNodePortServices":
		if spec.String("type") == "NodePort" {
			return "NodePort services are not allowed."
		}
	default:
		return "Unsupported admission policy " + policy
	}
	return ""
}

func validateContexts(pod resources.Object, excludeInit bool, message string, authorized []string, invalid func(resources.Object) bool) string {
	var violations []resources.Object
	for _, container := range contexts(pod, excludeInit) {
		if invalid(container.Object("ctx")) {
			violations = append(violations, container)
		}
	}
	if len(violations) > 0 {
		return contextMessage(message, authorized, violations)
	}
	return ""
}

func podAndContainerContexts(pod resources.Object, podMessage, containerMessage string, authorized []string, invalid func(resources.Object) bool) string {
	if invalid(pod.Object("spec").Object("securityContext")) {
		ctx, _ := json.Marshal(pod.Object("spec").Object("securityContext"))
		return contextMessage(podMessage, authorized, []resources.Object{{"name": json.RawMessage(`"pod"`), "ctx": ctx}})
	}
	return validateContexts(pod, false, containerMessage, authorized, invalid)
}

func restrictCapabilities(pod resources.Object) string {
	violations := CapabilityViolations(contexts(pod, true), []string{"NET_BIND_SERVICE"})
	if len(violations) > 0 {
		return contextMessage("Unauthorized container capabilities in securityContext.capabilities.add", []string{"NET_BIND_SERVICE"}, violations)
	}
	return ""
}

func blockedAnnotations(pod resources.Object, blocked []string, message string) string {
	var violations []string
	annotations := pod.Object("metadata").Object("annotations")
	for _, key := range blocked {
		if annotations.Has(key) {
			violations = append(violations, key)
		}
	}
	sort.Strings(violations)
	if len(violations) > 0 {
		return message + strings.Join(violations, ", ")
	}
	return ""
}
