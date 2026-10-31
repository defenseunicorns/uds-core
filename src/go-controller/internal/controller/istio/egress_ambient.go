// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package istio

import (
	"context"
	"fmt"

	"log/slog"
	"sort"

	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"

	"k8s.io/client-go/dynamic"

	udstypes "github.com/defenseunicorns/uds-core/src/go-controller/api/uds/v1alpha1"

	"github.com/defenseunicorns/uds-core/src/go-controller/internal/resources"
	"github.com/defenseunicorns/uds-core/src/go-controller/internal/utils"
)

func reconcileAmbientEgress(ctx context.Context, client dynamic.Interface, triggerPkgName string, allPackages []*udstypes.UDSPackage) error {
	merged := make(map[string]*ambientHostData)

	// anywhereNS/anywhereSA track identities from packages with Anywhere egress (no remoteHost).
	// These are merged into every host's AP so "anywhere" packages can reach all external hosts.
	anywhereNS := make(map[int32][]string) // port → namespaces (0 = any port)
	anywhereSA := make(map[int32][]string) // port → SA principals (0 = any port)

	for _, p := range allPackages {
		// Skip packages being deleted — their egress identities are being removed.
		if p.DeletionTimestamp != nil {
			continue
		}
		if p.Spec.GetServiceMeshMode() != udstypes.Ambient {
			continue
		}

		pkgID := fmt.Sprintf("%s-%s", p.Name, p.Namespace)

		for _, allow := range p.Spec.GetAllow() {
			if allow.Direction != udstypes.Egress || (allow.RemoteProtocol != nil && *allow.RemoteProtocol == udstypes.RemoteProtocolUDP) {
				continue
			}

			// Collect "anywhere" participants (no remoteHost, remoteGenerated=Anywhere).
			if allow.RemoteHost == nil {
				if allow.RemoteGenerated == nil || *allow.RemoteGenerated != udstypes.Anywhere {
					continue
				}

				anyPorts := allowedPorts(allow)
				if len(anyPorts) == 0 {
					anyPorts = []int32{0} // 0 = applies to all ports
				}

				var principal string
				if allow.ServiceAccount != nil {
					principal = fmt.Sprintf("cluster.local/ns/%s/sa/%s", p.Namespace, *allow.ServiceAccount)
				}

				for _, port := range anyPorts {
					if principal != "" {
						if !containsStr(anywhereSA[port], principal) {
							anywhereSA[port] = append(anywhereSA[port], principal)
						}
					} else {
						if !containsStr(anywhereNS[port], p.Namespace) {
							anywhereNS[port] = append(anywhereNS[port], p.Namespace)
						}
					}
				}
				continue
			}

			host := *allow.RemoteHost
			protocol := "TLS"
			if allow.RemoteProtocol != nil && *allow.RemoteProtocol == udstypes.HTTP {
				protocol = "HTTP"
			}

			ports := allowedPorts(allow)
			if len(ports) == 0 {
				port := int32(443)
				if protocol == "HTTP" {
					port = 80
				}
				ports = []int32{port}
			}

			if merged[host] == nil {
				merged[host] = &ambientHostData{
					portIdentities: make(map[int32]*portIdentity),
				}
			}
			hd := merged[host]
			for _, port := range ports {
				for _, existing := range hd.portProtocols {
					if existing.Port == port && existing.Protocol != protocol {
						return fmt.Errorf("protocol conflict for %s:%d", host, port)
					}
				}
			}

			if !containsStr(hd.pkgIDs, pkgID) {
				hd.pkgIDs = append(hd.pkgIDs, pkgID)
			}

			// Build identity for this allow rule.
			var principal, ns string
			if allow.ServiceAccount != nil {
				principal = fmt.Sprintf("cluster.local/ns/%s/sa/%s", p.Namespace, *allow.ServiceAccount)
			} else {
				ns = p.Namespace
			}

			for _, port := range ports {
				hd.portProtocols = append(hd.portProtocols, hostPortProtocol{
					Host: host, Port: port, Protocol: protocol,
				})

				pi := hd.portIdentities[port]
				if pi == nil {
					pi = &portIdentity{}
					hd.portIdentities[port] = pi
				}
				if principal != "" && !containsStr(pi.saPrincipals, principal) {
					pi.saPrincipals = append(pi.saPrincipals, principal)
				}
				if ns != "" && !containsStr(pi.namespaces, ns) {
					pi.namespaces = append(pi.namespaces, ns)
				}
			}
		}
	}

	// Merge "anywhere" participants into every host's per-port identities.
	for _, hd := range merged {
		for port := range hd.portIdentities {
			pi := hd.portIdentities[port]
			// Anywhere with this specific port or any port (key 0).
			for _, anyPort := range []int32{0, port} {
				for _, ns := range anywhereNS[anyPort] {
					if !containsStr(pi.namespaces, ns) {
						pi.namespaces = append(pi.namespaces, ns)
					}
				}
				for _, sa := range anywhereSA[anyPort] {
					if !containsStr(pi.saPrincipals, sa) {
						pi.saPrincipals = append(pi.saPrincipals, sa)
					}
				}
			}
		}
	}

	// If no ambient packages have remoteHost rules, purge any leftover egress resources.
	if len(merged) == 0 {
		if err := purgeAmbientEgressOrphans(ctx, client, nil, nil); err != nil {
			return err
		}
		// Select only the shared waypoint and preserve the inspected object version.
		return purgeByNames(ctx, client, gatewayGVR, ambientEgressNS, "uds/package=shared-ambient-egress-resource", nil)
	}

	// Collect all contributing package IDs for waypoint annotations.
	var allPkgIDs []string
	for _, hd := range merged {
		for _, id := range hd.pkgIDs {
			if !containsStr(allPkgIDs, id) {
				allPkgIDs = append(allPkgIDs, id)
			}
		}
	}
	sort.Strings(allPkgIDs)

	// Create (or update) the shared egress waypoint Gateway before applying SEs/APs.
	// Without the waypoint, ServiceEntries cannot bind to it and APs cannot enforce.
	egressGW := buildEgressWaypointGateway(allPkgIDs)
	if err := resources.ServerSideApply(ctx, client, gatewayGVR, egressGW); err != nil {
		return fmt.Errorf("apply egress waypoint Gateway: %w", err)
	}
	slog.Debug("Applied egress waypoint Gateway", "trigger", triggerPkgName)

	// Track applied resource names for orphan pruning.
	appliedSENames := make(map[string]bool)
	appliedAPNames := make(map[string]bool)

	for host, hd := range merged {
		// Skip if no identities resolved — avoid creating an open-allow window.
		hasIdentity := false
		for _, pi := range hd.portIdentities {
			if len(pi.saPrincipals) > 0 || len(pi.namespaces) > 0 {
				hasIdentity = true
				break
			}
		}
		if !hasIdentity {
			slog.Warn("Skipping ambient egress host — no source identities resolved", "host", host, "trigger", triggerPkgName)
			continue
		}

		ap := buildAmbientEgressAuthorizationPolicy(host, hd)
		if err := resources.ServerSideApply(ctx, client, egressAuthGVR, ap); err != nil {
			return fmt.Errorf("apply ambient egress AuthorizationPolicy for %s: %w", host, err)
		}
		appliedAPNames[ap.GetName()] = true

		se := buildAmbientEgressServiceEntry(host, hd.portProtocols, hd.pkgIDs, ambientEgressNS)
		if err := resources.ServerSideApply(ctx, client, serviceEntryGVR, se); err != nil {
			return fmt.Errorf("apply ambient egress ServiceEntry for %s: %w", host, err)
		}
		appliedSENames[se.GetName()] = true

		slog.Debug("Applied ambient egress resources", "host", host, "trigger", triggerPkgName)
	}

	// Purge orphaned shared ambient egress SEs and APs.
	return purgeAmbientEgressOrphans(ctx, client, appliedSENames, appliedAPNames)
}

// buildAmbientEgressAuthorizationPolicy creates a centralized ALLOW AP per external host.
// It uses targetRef to scope to the ServiceEntry, and per-port rules for strict isolation.
func buildAmbientEgressAuthorizationPolicy(host string, hd *ambientHostData) *unstructured.Unstructured {
	name := utils.SanitizeResourceName("ambient-ap-" + host)

	// Sort ports for deterministic output.
	portNums := make([]int32, 0, len(hd.portIdentities))
	for p := range hd.portIdentities {
		portNums = append(portNums, p)
	}
	sort.Slice(portNums, func(i, j int) bool { return portNums[i] < portNums[j] })

	var rules []interface{}
	for _, port := range portNums {
		pi := hd.portIdentities[port]

		var fromSources []interface{}
		if len(pi.saPrincipals) > 0 {
			sort.Strings(pi.saPrincipals)
			principals := make([]interface{}, len(pi.saPrincipals))
			for i, p := range pi.saPrincipals {
				principals[i] = p
			}
			fromSources = append(fromSources, map[string]interface{}{
				"source": map[string]interface{}{"principals": principals},
			})
		}
		if len(pi.namespaces) > 0 {
			sort.Strings(pi.namespaces)
			nsList := make([]interface{}, len(pi.namespaces))
			for i, ns := range pi.namespaces {
				nsList[i] = ns
			}
			fromSources = append(fromSources, map[string]interface{}{
				"source": map[string]interface{}{"namespaces": nsList},
			})
		}
		if len(fromSources) == 0 {
			continue
		}

		rules = append(rules, map[string]interface{}{
			"from": fromSources,
			"to": []interface{}{
				map[string]interface{}{
					"operation": map[string]interface{}{
						"ports": []interface{}{fmt.Sprintf("%d", port)},
					},
				},
			},
		})
	}

	return &unstructured.Unstructured{
		Object: map[string]interface{}{
			"apiVersion": "security.istio.io/v1beta1",
			"kind":       "AuthorizationPolicy",
			"metadata": map[string]interface{}{
				"name":      name,
				"namespace": ambientEgressNS,
				"labels": map[string]interface{}{
					"uds/package": "shared-ambient-egress-resource",
					"uds/for":     "egress",
				},
			},
			"spec": map[string]interface{}{
				"action": "ALLOW",
				"targetRef": map[string]interface{}{
					"group": "networking.istio.io",
					"kind":  "ServiceEntry",
					"name":  utils.SanitizeResourceName("ambient-se-" + host),
				},
				"rules": rules,
			},
		},
	}
}
