// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package policies

import (
	"bytes"
	"encoding/json"
	"os"
	"regexp"
	"strings"

	"github.com/defenseunicorns/uds-core/src/go-controller/internal/admission/resources"
)

var imageTag = regexp.MustCompile(`[@:][^/]+$`)

func ParseImageRef(image string) (string, string, bool) {
	image = strings.TrimFunc(image, jsWhitespace)
	if image == "" {
		return "", "", false
	}
	image = imageTag.ReplaceAllString(image, "")
	parts := strings.Split(image, "/")
	if strings.ContainsAny(parts[0], ".:") || parts[0] == "localhost" {
		repository := strings.Join(parts[1:], "/")
		return parts[0], repository, repository != ""
	}
	return "docker.io", image, true
}

func ValidateIstioImage(image string) bool {
	registry, repository, valid := ParseImageRef(image)
	if !valid {
		return false
	}
	zarf := os.Getenv("ZARF_REGISTRY_ADDRESS")
	if zarf == "" {
		zarf = "127.0.0.1:31999"
	}
	flavors := map[string]string{"istio/proxyv2": "docker.io", "ironbank/tetrate/istio/proxyv2": "registry1.dso.mil", "defenseunicorns.com/istio-proxy-fips": "cgr.dev"}
	canonical, found := flavors[repository]
	return found && (registry == canonical || registry == zarf)
}

// ECMAScript TrimString's exact whitespace/line-terminator set. Go's TrimSpace
// additionally trims NEL and does not trim BOM, which can change image trust.
func jsWhitespace(value rune) bool {
	return value == 0x09 || value == 0x0b || value == 0x0c || value == 0x20 || value == 0xa0 || value == 0xfeff || value == 0x0a || value == 0x0d || value == 0x2028 || value == 0x2029 || value == 0x1680 || value >= 0x2000 && value <= 0x200a || value == 0x202f || value == 0x205f || value == 0x3000
}

func Containers(pod resources.Object) []resources.Object {
	spec := pod.Object("spec")
	containers := append(spec.List("containers"), spec.List("initContainers")...)
	return append(containers, spec.List("ephemeralContainers")...)
}

func IsIstioProxy(container resources.Object) bool {
	args := container.Strings("args")
	if container.String("name") != "istio-proxy" || len(args) == 0 || args[0] != "proxy" || container.Has("command") || !ValidateIstioImage(container.String("image")) {
		return false
	}
	for _, port := range container.List("ports") {
		if port.String("name") == "http-envoy-prom" {
			return true
		}
	}
	return false
}

func IsIstioInit(pod, container resources.Object) bool {
	if !pod.Object("metadata").Object("annotations").Has("sidecar.istio.io/status") {
		return false
	}
	hasProxy := false
	for _, init := range pod.Object("spec").List("initContainers") {
		hasProxy = hasProxy || IsIstioProxy(init)
	}
	args := container.Strings("args")
	return hasProxy && container.String("name") == "istio-init" && len(args) > 0 && args[0] == "istio-iptables" && !container.Has("command") && ValidateIstioImage(container.String("image"))
}

func HasNumber(values []float64, required float64) bool {
	for _, value := range values {
		if value == required {
			return true
		}
	}
	return false
}
func HasString(values []string, required string) bool {
	for _, value := range values {
		if value == required {
			return true
		}
	}
	return false
}
func IsRoot(context resources.Object) bool {
	return string(context["runAsNonRoot"]) == "false" || context.Has("runAsUser") && string(context["runAsUser"]) != "null" && context.Number("runAsUser") == 0 || HasNumber(context.Numbers("supplementalGroups"), 0)
}

func contextMessage(message string, authorized []string, violations []resources.Object) string {
	var found []string
	for _, violation := range violations {
		var compact bytes.Buffer
		_ = json.Compact(&compact, violation["ctx"])
		found = append(found, `{"name":`+string(violation["name"])+`,"ctx":`+compact.String()+`}`)
	}
	return message + ". Authorized: [" + strings.Join(authorized, " | ") + "] Found: " + strings.Join(found, " | ")
}

func contexts(pod resources.Object, excludeInit bool) []resources.Object {
	var result []resources.Object
	for _, container := range Containers(pod) {
		if !container.Truthy("securityContext") || excludeInit && IsIstioInit(pod, container) {
			continue
		}
		result = append(result, resources.Object{"name": container["name"], "ctx": container["securityContext"]})
	}
	return result
}
