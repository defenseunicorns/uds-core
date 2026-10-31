// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package dependencies

import (
	"github.com/defenseunicorns/uds-core/src/go-controller/internal/config"
	corev1 "k8s.io/api/core/v1"
	discoveryv1 "k8s.io/api/discovery/v1"
	"net/netip"
	"slices"
	"sort"
)

func hostCIDR(value string) string {
	address, err := netip.ParseAddr(value)
	if err != nil {
		return ""
	}
	return netip.PrefixFrom(address, address.BitLen()).String()
}
func uniqueCIDRs(values []string) []string { sort.Strings(values); return slices.Compact(values) }
func NodeCIDRs(objects []interface{}) []string {
	var result []string
	for _, obj := range objects {
		node, ok := obj.(*corev1.Node)
		if !ok {
			continue
		}
		for _, address := range node.Status.Addresses {
			if address.Type == corev1.NodeInternalIP {
				if cidr := hostCIDR(address.Address); cidr != "" {
					result = append(result, cidr)
				}
			}
		}
	}
	return uniqueCIDRs(result)
}
func EndpointCIDRs(objects []interface{}) []string {
	var result []string
	for _, obj := range objects {
		endpoint, ok := obj.(*discoveryv1.EndpointSlice)
		if !ok || endpoint.Namespace != "default" || (endpoint.Name != "kubernetes" && endpoint.Labels[discoveryv1.LabelServiceName] != "kubernetes") {
			continue
		}
		for _, entry := range endpoint.Endpoints {
			for _, address := range entry.Addresses {
				if cidr := hostCIDR(address); cidr != "" {
					result = append(result, cidr)
				}
			}
		}
	}
	return uniqueCIDRs(result)
}
func ServiceCIDRs(obj interface{}) []string {
	service, ok := obj.(*corev1.Service)
	if !ok {
		return nil
	}
	var result []string
	for _, address := range append(slices.Clone(service.Spec.ClusterIPs), service.Spec.ClusterIP) {
		if cidr := hostCIDR(address); cidr != "" {
			result = append(result, cidr)
		}
	}
	return uniqueCIDRs(result)
}
func LoadOperatorSecret(cfg *config.Config, obj interface{}) {
	cfg.AllowPublicClients = false
	cfg.AuthserviceRedisUri = ""
	cfg.KeycloakClientMode = "CLIENT_SECRET"
	secret, ok := obj.(*corev1.Secret)
	if !ok {
		return
	}
	cfg.AllowPublicClients = string(secret.Data["ALLOW_PUBLIC_CLIENTS"]) == "true"
	cfg.AuthserviceRedisUri = string(secret.Data["AUTHSERVICE_REDIS_URI"])
	if cfg.AuthserviceRedisUri == "###ZARF_VAR_AUTHSERVICE_REDIS_URI###" {
		cfg.AuthserviceRedisUri = ""
	}
	switch mode := string(secret.Data["KEYCLOAK_CLIENT_MODE"]); mode {
	case "AUTO", "CLIENT_SECRET", "SIGNED_JWT":
		cfg.KeycloakClientMode = mode
	}
}
