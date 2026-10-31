// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
package dependencies

import "k8s.io/apimachinery/pkg/runtime/schema"

// OwnedResources covers every custom resource written by Package workflows.
// Reflector relists deliver spec/deletion drift after a disconnected watch;
// periodic Package checks can therefore preserve successful recovery epochs.
func OwnedResources() []schema.GroupVersionResource {
	return []schema.GroupVersionResource{
		{Group: "security.istio.io", Version: "v1beta1", Resource: "authorizationpolicies"},
		{Group: "security.istio.io", Version: "v1beta1", Resource: "requestauthentications"},
		{Group: "networking.istio.io", Version: "v1beta1", Resource: "virtualservices"},
		{Group: "networking.istio.io", Version: "v1beta1", Resource: "serviceentries"},
		{Group: "networking.istio.io", Version: "v1beta1", Resource: "sidecars"},
		{Group: "networking.istio.io", Version: "v1beta1", Resource: "gateways"},
		{Group: "gateway.networking.k8s.io", Version: "v1", Resource: "gateways"},
		{Group: "gateway.networking.k8s.io", Version: "v1", Resource: "udproutes"},
		{Group: "monitoring.coreos.com", Version: "v1", Resource: "podmonitors"},
		{Group: "monitoring.coreos.com", Version: "v1", Resource: "servicemonitors"},
		{Group: "monitoring.coreos.com", Version: "v1", Resource: "probes"},
	}
}
