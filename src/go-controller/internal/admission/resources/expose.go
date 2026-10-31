// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package resources

import (
	"fmt"
	"strings"

	"github.com/defenseunicorns/uds-core/src/go-controller/internal/utils"
)

func validateExpose(name, namespace string, terminating bool, exposes, existing []Object, config Config) string {
	virtualNames, udpNames, udpPorts, uptime := map[string]bool{}, map[string]bool{}, map[string]bool{}, map[string]bool{}
	for _, expose := range exposes {
		gateway := expose.String("gateway")
		standard := gateway == "tenant" || gateway == "admin" || gateway == "passthrough"
		if gateway != "" && !standard && utils.SanitizeResourceName(gateway) != gateway {
			return fmt.Sprintf("Gateway name %q is not a valid Kubernetes resource name. It should only contain lowercase alphanumeric characters, '-', or '.'", gateway)
		}
		if expose.String("protocol") == "UDP" {
			if message := validateUDP(name, namespace, expose, existing, udpNames, udpPorts); message != "" {
				return message
			}
			continue
		}
		if expose.String("protocol") == "HTTP" && !expose.Truthy("host") {
			return "host must be set when protocol is HTTP"
		}
		if !expose.Truthy("protocol") && !expose.Truthy("host") {
			return "host must be set"
		}
		if gateway != "" && standard && expose.Truthy("domain") {
			return "domain cannot be set for the standard gateways (tenant, admin, or passthrough)"
		}
		advanced := advancedHTTP(expose)
		if strings.Contains(gateway, "passthrough") && advanced != nil {
			return "advancedHTTP cannot be used with a passthrough gateway"
		}
		if advanced.Truthy("directResponse") && (expose.Truthy("service") || expose.Truthy("selector") || expose.Truthy("port") || expose.Truthy("targetPort")) {
			return "directResponse cannot be combined with service, port, selector, targetPort"
		}
		resourceName := virtualServiceName(name, expose)
		if virtualNames[resourceName] {
			return fmt.Sprintf("The combination of characteristics of this expose entry would create a duplicate VirtualService. Verify you do not have duplicate values, or add a unique \"description\" field for this rule. The duplicate rule would be named %q.", resourceName)
		}
		virtualNames[resourceName] = true
		if !terminating {
			if owner := conflictingExpose(expose, namespace, existing, config); owner != "" {
				return fmt.Sprintf("The endpoint %q conflicts with a package in namespace %q. Each catch-all exposed endpoint must be unique across namespaces; use advancedHTTP.match for path-based routing.", fqdn(expose, config), owner)
			}
		}
		paths := expose.Object("uptime").Object("checks").Strings("paths")
		if len(paths) > 0 {
			for _, path := range paths {
				if !strings.HasPrefix(path, "/") {
					return fmt.Sprintf("Uptime probe path %q must start with \"/\"", path)
				}
			}
			endpoint := fqdn(expose, config)
			if uptime[endpoint] {
				return fmt.Sprintf("Duplicate uptime probe for FQDN %q. Only one expose entry per FQDN can have uptime checks configured.", endpoint)
			}
			uptime[endpoint] = true
		}
	}
	return ""
}

func conflictingExpose(expose Object, namespace string, existing []Object, config Config) string {
	for _, pkg := range existing {
		owner := pkg.Object("metadata").String("namespace")
		if owner == "" || owner == namespace {
			continue
		}
		for _, old := range pkg.Object("spec").Object("network").List("expose") {
			if old.String("protocol") != "UDP" && exposureKey(old, config) == exposureKey(expose, config) && (!effectiveMatch(old) || !effectiveMatch(expose)) {
				return owner
			}
		}
	}
	return ""
}

func validateUDP(name, namespace string, expose Object, existing []Object, names, ports map[string]bool) string {
	for _, field := range []string{"host", "domain", "match", "advancedHTTP", "uptime", "podLabels"} {
		invalid := expose.Truthy(field)
		if field == "host" || field == "domain" || field == "match" {
			invalid = expose.Has(field)
		}
		if invalid {
			if field == "podLabels" {
				return "podLabels cannot be set when protocol is UDP; use selector"
			}
			return field + " cannot be set when protocol is UDP"
		}
	}
	suffix := expose.Value("port")
	if expose.Has("description") {
		suffix = expose.String("description")
	}
	resourceName := utils.SanitizeResourceName(name + "-udp-" + suffix)
	if names[resourceName] {
		return fmt.Sprintf("The combination of characteristics of this expose entry would create a duplicate UDPRoute. Verify you do not have duplicate values, or add a unique \"description\" field for this rule. The duplicate rule would be named %q.", resourceName)
	}
	names[resourceName] = true
	gateway := defaultString(expose.String("gateway"), "envoy-default-gateway")
	key := gateway + ":" + expose.Value("port")
	if ports[key] {
		return fmt.Sprintf("Only one UDP expose entry can use port %s on gateway %q in a package. Use a different port or a different gateway.", expose.Value("port"), gateway)
	}
	ports[key] = true
	for _, pkg := range existing {
		if pkg.Object("metadata").String("namespace") == namespace {
			continue
		}
		for _, old := range pkg.Object("spec").Object("network").List("expose") {
			if old.String("protocol") == "UDP" && old.Has("port") && defaultString(old.String("gateway"), "envoy-default-gateway")+":"+old.Value("port") == key {
				return fmt.Sprintf("UDP expose port %s on gateway %q is already in use by another package.", expose.Value("port"), gateway)
			}
		}
	}
	return ""
}
