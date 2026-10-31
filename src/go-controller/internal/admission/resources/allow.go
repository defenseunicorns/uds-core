// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package resources

import (
	"fmt"
	"strings"

	"github.com/defenseunicorns/uds-core/src/go-controller/internal/utils"
)

func migrateAllow(rule Object) Object {
	if rule.Truthy("podLabels") {
		rule["selector"] = rule["podLabels"]
	}
	if rule.Truthy("remotePodLabels") {
		rule["remoteSelector"] = rule["remotePodLabels"]
	}
	return rule
}

func validateAllow(pkgName, mode string, rules []Object) string {
	names := map[string]bool{}
	for _, original := range rules {
		rule := migrateAllow(original)
		generated, namespace, selector, cidr, host := rule.Truthy("remoteGenerated"), rule.Has("remoteNamespace"), rule.Truthy("remoteSelector"), rule.Truthy("remoteCidr"), rule.Truthy("remoteHost")
		protocol := rule.String("remoteProtocol")
		l7 := protocol == "TLS" || protocol == "HTTP"
		if !generated && !namespace && !selector && !cidr && !host {
			return "network allow rules must specify a remote: remoteGenerated, remoteNamespace, remoteSelector, remoteCidr, or remoteHost"
		}
		if generated && (namespace || selector || cidr || host || l7) {
			return "remoteGenerated cannot be combined with remoteNamespace, remoteSelector, remoteCidr, remoteHost, or TLS/HTTP remoteProtocol"
		}
		if (namespace || selector) && (generated || cidr || host || l7) {
			return "remoteNamespace and remoteSelector cannot be combined with remoteGenerated, remoteCidr, remoteHost, or TLS/HTTP remoteProtocol"
		}
		if cidr && (generated || namespace || selector || host || l7) {
			return "remoteCidr cannot be combined with remoteGenerated, remoteNamespace, remoteSelector, remoteHost, or TLS/HTTP remoteProtocol"
		}
		remote := rule.String("remoteGenerated")
		if protocol == "UDP" && (remote == "KubeAPI" || remote == "KubeNodes" || remote == "CloudMetadata") {
			return "UDP remoteProtocol cannot be combined with remoteGenerated KubeAPI, KubeNodes, or CloudMetadata (these endpoints are TCP-only); got: " + remote
		}
		if protocol == "TCP" && host {
			return "TCP remoteProtocol cannot be combined with remoteHost; use TLS or HTTP for external egress"
		}
		if protocol == "UDP" && host {
			return "UDP remoteProtocol cannot be combined with remoteHost"
		}
		if (host || l7) && rule.String("direction") == "Ingress" {
			return "remoteHost and TLS/HTTP remoteProtocol cannot be combined with Ingress direction"
		}
		if host && strings.Contains(rule.String("remoteHost"), "*") {
			return "remoteHost does not support wildcard domains"
		}
		if rule.Truthy("serviceAccount") && !(mode == "ambient" && (host || remote == "Anywhere" && rule.String("direction") == "Egress")) {
			return "serviceAccount is only valid for Ambient mode when using remoteHost or remoteGenerated: Anywhere on Egress rules"
		}
		name := utils.SanitizeResourceName("allow-" + pkgName + "-" + allowName(rule))
		if names[name] {
			return fmt.Sprintf("The combination of characteristics of this network allow rule would create a duplicate NetworkPolicy. Verify you do not have duplicate allow rules, or add a unique \"description\" field for this rule. The duplicate rule would be named %q.", name)
		}
		names[name] = true
	}
	return ""
}

func allowName(rule Object) string {
	name := rule.String("description")
	if name == "" {
		// JavaScript flat(1) leaves Object.values arrays nested in a remote tuple;
		// array-to-string therefore uses commas for each label group.
		parts := values(rule["selector"])
		if rule.Truthy("remoteGenerated") {
			parts = append(parts, rule.String("remoteGenerated"))
		} else {
			parts = append(parts, rule.String("remoteNamespace"), strings.Join(values(rule["remoteSelector"]), ","))
		}
		protocol := "TCP"
		if rule.String("remoteProtocol") == "UDP" {
			protocol = "UDP"
		}
		parts = append(parts, protocol)
		name = joinedNonEmpty(parts)
	}
	return rule.String("direction") + "-" + name
}
