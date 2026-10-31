// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package resources

import (
	"encoding/json"
	"fmt"
	"reflect"
	"strings"

	"github.com/defenseunicorns/uds-core/src/go-controller/internal/utils"
)

type Config struct {
	Domain, AdminDomain string
	AllowPublicClients  bool
}

// ValidatePackage mirrors the pinned Core validator against an immutable cache
// snapshot. The controller waits for its package informer before serving it.
func ValidatePackage(pkg, old Object, existing []Object, config Config) string {
	if pkg.Object("metadata").Truthy("deletionTimestamp") {
		var currentSpec, oldSpec any
		if old == nil || json.Unmarshal(pkg["spec"], &currentSpec) != nil || json.Unmarshal(old["spec"], &oldSpec) != nil || !reflect.DeepEqual(currentSpec, oldSpec) {
			return "Package spec cannot change during deletion."
		}
	}
	metadata, spec := pkg.Object("metadata"), pkg.Object("spec")
	namespace := defaultString(metadata.String("namespace"), "_unknown_")
	name := defaultString(metadata.String("name"), "_unknown_")
	for _, invalid := range []string{"kube-system", "kube-public", "_unknown_", "pepr-system"} {
		if namespace == invalid {
			return "invalid namespace"
		}
	}
	if !metadata.Truthy("deletionTimestamp") {
		for _, old := range existing {
			oldMeta := old.Object("metadata")
			if oldMeta.String("namespace") == namespace && oldMeta.String("name") != name {
				return fmt.Sprintf("A package with the name %q already exists in the namespace %q. Only one package can exist in a namespace.", oldMeta.String("name"), namespace)
			}
		}
	}
	network := spec.Object("network")
	mode := defaultString(network.Object("serviceMesh").String("mode"), "ambient")
	if message := validateExpose(name, namespace, metadata.Truthy("deletionTimestamp"), network.List("expose"), existing, config); message != "" {
		return message
	}
	if message := validateAllow(name, mode, network.List("allow")); message != "" {
		return message
	}
	if message := validateSSO(namespace, spec, existing, config.AllowPublicClients, metadata.Truthy("deletionTimestamp")); message != "" {
		return message
	}
	return validateMonitors(name, spec.List("monitor"))
}

func fqdn(expose Object, config Config) string {
	gateway := defaultString(expose.String("gateway"), "tenant")
	domain := config.Domain
	if expose.Truthy("domain") {
		domain = expose.String("domain")
	} else if gateway == "admin" || strings.Contains(gateway, "admin") {
		domain = config.AdminDomain
	}
	if expose.String("host") == "." {
		return domain
	}
	return expose.Value("host") + "." + domain
}

func exposureKey(expose Object, config Config) string {
	return strings.ToLower(defaultString(expose.String("gateway"), "tenant") + ":" + fqdn(expose, config))
}

func advancedHTTP(expose Object) Object {
	advanced := expose.Object("advancedHTTP")
	if expose.Truthy("match") {
		if advanced == nil {
			advanced = Object{}
		}
		advanced["match"] = expose["match"]
	}
	return advanced
}

func effectiveMatch(expose Object) bool {
	matches := advancedHTTP(expose).List("match")
	if len(matches) == 0 {
		return false
	}
	for _, match := range matches {
		effective := len(match.Object("uri")) > 0 || len(match.Object("method")) > 0
		for _, raw := range match.Object("queryParams") {
			value, _ := Decode(raw)
			effective = effective || len(value) > 0
		}
		if !effective {
			return false
		}
	}
	return true
}

func virtualServiceName(pkgName string, expose Object) string {
	var matchNames []string
	for _, match := range advancedHTTP(expose).List("match") {
		matchNames = append(matchNames, match.String("name"))
	}
	host := expose.Value("host")
	if host == "." {
		host = "root-domain"
	}
	suffix := defaultString(expose.String("description"), host+"-"+expose.Value("port")+"-"+expose.Value("service")+"-"+strings.Join(matchNames, "-"))
	return utils.SanitizeResourceName(pkgName + "-" + defaultString(expose.String("gateway"), "tenant") + "-" + suffix)
}

func validateMonitors(pkgName string, monitors []Object) string {
	names := map[string]bool{}
	for _, monitor := range monitors {
		kind := "ServiceMonitor"
		if monitor.String("kind") == "PodMonitor" {
			kind = "PodMonitor"
		}
		suffix := defaultString(monitor.String("description"), strings.Join(values(monitor["selector"]), ",")+"-"+monitor.String("portName"))
		name := utils.SanitizeResourceName(pkgName + "-" + suffix)
		if names[kind+"/"+name] {
			return fmt.Sprintf("The combination of characteristics of this monitor entry would create a duplicate %s. Verify you do not have duplicate values, or add a unique \"description\" field for this monitor. The duplicate rule would be named %q.", kind, name)
		}
		names[kind+"/"+name] = true
	}
	return ""
}
