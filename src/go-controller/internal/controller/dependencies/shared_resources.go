// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
package dependencies

import (
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"strings"
)

// Shared resources aggregate multiple Packages and cannot have cross-namespace
// Package owner references. Restrict their repair signals to the identities Core
// generates in platform-owned namespaces; tenant labels are not authority.
func sharedResource(obj interface{}) bool {
	u, ok := obj.(*unstructured.Unstructured)
	if !ok || u.GetUID() == "" {
		return false
	}
	group, kind, name := u.GroupVersionKind().Group, u.GetKind(), u.GetName()
	switch u.GetLabels()["uds/package"] {
	case "shared-egress-resource":
		if u.GetNamespace() != "istio-egress-gateway" || group != "networking.istio.io" {
			return false
		}
		prefix := map[string]string{"Gateway": "gateway-", "VirtualService": "virtual-service-", "ServiceEntry": "service-entry-"}[kind]
		return prefix != "" && strings.HasPrefix(name, prefix)
	case "shared-ambient-egress-resource":
		if u.GetNamespace() != "istio-egress-ambient" {
			return false
		}
		return (group == "gateway.networking.k8s.io" && kind == "Gateway" && name == "egress-waypoint") ||
			(group == "networking.istio.io" && kind == "ServiceEntry" && strings.HasPrefix(name, "ambient-se-")) ||
			(group == "security.istio.io" && kind == "AuthorizationPolicy" && strings.HasPrefix(name, "ambient-ap-"))
	case "shared-envoy-gateway-resource":
		return u.GetNamespace() == "envoy-default-gateway" && group == "gateway.networking.k8s.io" && kind == "Gateway" && name == "envoy-default-gateway"
	}
	return false
}
