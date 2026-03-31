// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package istio

import (
	"context"
	"fmt"
	"log/slog"
	"sort"
	"strings"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/labels"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/dynamic"

	udstypes "github.com/defenseunicorns/uds-core/src/go-controller/api/uds/v1alpha1"
	udsv1alpha1lister "github.com/defenseunicorns/uds-core/src/go-controller/client/listers/uds/v1alpha1"
	"github.com/defenseunicorns/uds-core/src/go-controller/internal/resources"
	"github.com/defenseunicorns/uds-core/src/go-controller/internal/utils"
)

var (
	sidecarGVR    = schema.GroupVersionResource{Group: "networking.istio.io", Version: "v1beta1", Resource: "sidecars"}
	egressAuthGVR = schema.GroupVersionResource{Group: "security.istio.io", Version: "v1beta1", Resource: "authorizationpolicies"}
	gatewayGVR    = schema.GroupVersionResource{Group: "gateway.networking.k8s.io", Version: "v1", Resource: "gateways"}
)

const ambientEgressNS = "istio-egress-ambient"

// hostPortProtocol groups allow rules by remote host.
type hostPortProtocol struct {
	Host     string
	Port     int32
	Protocol string // "TLS" or "HTTP"
}

// ambientHostData holds merged per-host data from all contributing packages.
type ambientHostData struct {
	pkgIDs        []string
	portProtocols []hostPortProtocol
	// portIdentities tracks per-port source identity for strict enforcement.
	portIdentities map[int32]*portIdentity
}

type portIdentity struct {
	saPrincipals []string
	namespaces   []string
}

// ReconcileEgress creates egress ServiceEntries and Sidecars for external traffic.
func ReconcileEgress(ctx context.Context, client dynamic.Interface, pkg *udstypes.UDSPackage, namespace string, packageLister udsv1alpha1lister.UDSPackageLister) error {
	pkgName := pkg.Name
	generation := utils.PkgGeneration(pkg)
	ownerRefs := utils.GetOwnerRef(pkg)
	istioMode := pkg.Spec.GetServiceMeshMode()

	slog.Debug("Istio egress reconcile started",
		"package", pkgName, "namespace", namespace,
		"istioMode", istioMode,
		"allowRules", len(pkg.Spec.GetAllow()))

	// Collect all egress allow rules with remoteHost for the current package
	hostMap := make(map[string][]hostPortProtocol)
	for _, allow := range pkg.Spec.GetAllow() {
		if allow.Direction != udstypes.Egress || allow.RemoteHost == nil {
			continue
		}

		protocol := "TLS"
		if allow.RemoteProtocol != nil && *allow.RemoteProtocol == udstypes.HTTP {
			protocol = "HTTP"
		}

		var ports []int32
		if allow.Port != nil {
			ports = append(ports, int32(*allow.Port))
		}
		for _, fp := range allow.Ports {
			ports = append(ports, int32(fp))
		}
		if len(ports) == 0 {
			ports = []int32{443}
		}

		for _, port := range ports {
			hpp := hostPortProtocol{Host: *allow.RemoteHost, Port: port, Protocol: protocol}
			hostMap[*allow.RemoteHost] = append(hostMap[*allow.RemoteHost], hpp)
		}
	}

	if len(hostMap) == 0 {
		slog.Debug("No egress hosts found, skipping", "package", pkgName)
		return nil
	}

	slog.Debug("Egress hosts collected",
		"package", pkgName, "hostCount", len(hostMap), "istioMode", istioMode)

	if istioMode == udstypes.Sidecar {
		return reconcileSidecarEgress(ctx, client, pkgName, namespace, generation, ownerRefs, hostMap)
	}

	return reconcileAmbientEgress(ctx, client, pkgName, packageLister)
}

func reconcileSidecarEgress(ctx context.Context, client dynamic.Interface, pkgName, namespace, generation string, ownerRefs []metav1.OwnerReference, hostMap map[string][]hostPortProtocol) error {
	// Create local ServiceEntries for each host
	for host, ports := range hostMap {
		se := buildLocalEgressServiceEntry(host, ports, pkgName, namespace, generation, ownerRefs)
		if err := resources.ServerSideApply(ctx, client, serviceEntryGVR, se); err != nil {
			return fmt.Errorf("apply local egress ServiceEntry for %s: %w", host, err)
		}
		slog.Debug("Applied local egress ServiceEntry", "name", se.GetName(), "host", host)
	}

	// Create Sidecar resource with REGISTRY_ONLY outbound policy
	sidecar := buildEgressSidecar(pkgName, namespace, generation, ownerRefs)
	if err := resources.ServerSideApply(ctx, client, sidecarGVR, sidecar); err != nil {
		return fmt.Errorf("apply egress Sidecar: %w", err)
	}

	return nil
}

// reconcileAmbientEgress rebuilds shared ambient egress resources from ALL ambient packages.
// It creates a ServiceEntry + AuthorizationPolicy per external host in istio-egress-ambient.
func reconcileAmbientEgress(ctx context.Context, client dynamic.Interface, triggerPkgName string, packageLister udsv1alpha1lister.UDSPackageLister) error {
	// List all packages across all namespaces to build merged per-host identity map.
	allPackages, err := packageLister.List(labels.Everything())
	if err != nil {
		return fmt.Errorf("list packages for ambient egress: %w", err)
	}

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
			if allow.Direction != udstypes.Egress {
				continue
			}

			// Collect "anywhere" participants (no remoteHost, remoteGenerated=Anywhere).
			if allow.RemoteHost == nil {
				if allow.RemoteGenerated == nil || *allow.RemoteGenerated != udstypes.Anywhere {
					continue
				}

				var anyPorts []int32
				if allow.Port != nil {
					anyPorts = append(anyPorts, int32(*allow.Port))
				}
				for _, fp := range allow.Ports {
					anyPorts = append(anyPorts, int32(fp))
				}
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

			var ports []int32
			if allow.Port != nil {
				ports = append(ports, int32(*allow.Port))
			}
			for _, fp := range allow.Ports {
				ports = append(ports, int32(fp))
			}
			if len(ports) == 0 {
				ports = []int32{443}
			}

			if merged[host] == nil {
				merged[host] = &ambientHostData{
					portIdentities: make(map[int32]*portIdentity),
				}
			}
			hd := merged[host]

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
		purgeAmbientEgressOrphans(ctx, client, nil, nil)
		// Also delete the waypoint if it exists.
		if err := client.Resource(gatewayGVR).Namespace(ambientEgressNS).Delete(ctx, "egress-waypoint", metav1.DeleteOptions{}); err == nil {
			slog.Info("Deleted egress waypoint (no ambient egress packages remain)", "trigger", triggerPkgName)
		}
		return nil
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

		se := buildAmbientEgressServiceEntry(host, hd.portProtocols, hd.pkgIDs, ambientEgressNS)
		if err := resources.ServerSideApply(ctx, client, serviceEntryGVR, se); err != nil {
			return fmt.Errorf("apply ambient egress ServiceEntry for %s: %w", host, err)
		}
		appliedSENames[se.GetName()] = true

		ap := buildAmbientEgressAuthorizationPolicy(host, hd)
		if err := resources.ServerSideApply(ctx, client, egressAuthGVR, ap); err != nil {
			return fmt.Errorf("apply ambient egress AuthorizationPolicy for %s: %w", host, err)
		}
		appliedAPNames[ap.GetName()] = true

		slog.Debug("Applied ambient egress resources", "host", host, "trigger", triggerPkgName)
	}

	// Purge orphaned shared ambient egress SEs and APs.
	purgeAmbientEgressOrphans(ctx, client, appliedSENames, appliedAPNames)

	return nil
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

func purgeAmbientEgressOrphans(ctx context.Context, client dynamic.Interface, appliedSENames, appliedAPNames map[string]bool) {
	seList, err := client.Resource(serviceEntryGVR).Namespace(ambientEgressNS).List(ctx, metav1.ListOptions{
		LabelSelector: "uds/package=shared-ambient-egress-resource",
	})
	if err == nil {
		for _, item := range seList.Items {
			if !appliedSENames[item.GetName()] {
				if err := client.Resource(serviceEntryGVR).Namespace(ambientEgressNS).Delete(ctx, item.GetName(), metav1.DeleteOptions{}); err != nil {
					slog.Debug("Failed to delete orphaned ambient egress ServiceEntry", "name", item.GetName(), "error", err)
				} else {
					slog.Info("Purged orphaned ambient egress ServiceEntry", "name", item.GetName())
				}
			}
		}
	}

	apList, err := client.Resource(egressAuthGVR).Namespace(ambientEgressNS).List(ctx, metav1.ListOptions{
		LabelSelector: "uds/package=shared-ambient-egress-resource,uds/for=egress",
	})
	if err == nil {
		for _, item := range apList.Items {
			if !appliedAPNames[item.GetName()] {
				if err := client.Resource(egressAuthGVR).Namespace(ambientEgressNS).Delete(ctx, item.GetName(), metav1.DeleteOptions{}); err != nil {
					slog.Debug("Failed to delete orphaned ambient egress AuthorizationPolicy", "name", item.GetName(), "error", err)
				} else {
					slog.Info("Purged orphaned ambient egress AuthorizationPolicy", "name", item.GetName())
				}
			}
		}
	}
}

func buildLocalEgressServiceEntry(host string, ports []hostPortProtocol, pkgName, namespace, generation string, ownerRefs []metav1.OwnerReference) *unstructured.Unstructured {
	// Build unique port list
	var portSpecs []interface{}
	seen := make(map[string]bool)
	nameParts := []string{pkgName, "egress", utils.SanitizeResourceName(host)}

	for _, hpp := range ports {
		key := fmt.Sprintf("%s-%d", hpp.Protocol, hpp.Port)
		if seen[key] {
			continue
		}
		seen[key] = true
		portSpecs = append(portSpecs, map[string]interface{}{
			"name":     fmt.Sprintf("%s-%d", strings.ToLower(hpp.Protocol), hpp.Port),
			"number":   int64(hpp.Port),
			"protocol": hpp.Protocol,
		})
		nameParts = append(nameParts, fmt.Sprintf("%d", hpp.Port), strings.ToLower(hpp.Protocol))
	}

	name := utils.SanitizeResourceName(strings.Join(nameParts, "-"))

	se := &unstructured.Unstructured{
		Object: map[string]interface{}{
			"apiVersion": "networking.istio.io/v1beta1",
			"kind":       "ServiceEntry",
			"metadata": map[string]interface{}{
				"name":      name,
				"namespace": namespace,
				"labels": map[string]interface{}{
					"uds/package":    pkgName,
					"uds/generation": generation,
				},
			},
			"spec": map[string]interface{}{
				"hosts":      []interface{}{host},
				"location":   "MESH_EXTERNAL",
				"resolution": "DNS",
				"ports":      portSpecs,
				"exportTo":   []interface{}{"."},
			},
		},
	}
	setOwnerRefs(se, ownerRefs)
	return se
}

func buildEgressSidecar(pkgName, namespace, generation string, ownerRefs []metav1.OwnerReference) *unstructured.Unstructured {
	name := utils.SanitizeResourceName(fmt.Sprintf("%s-egress-default", pkgName))

	sc := &unstructured.Unstructured{
		Object: map[string]interface{}{
			"apiVersion": "networking.istio.io/v1beta1",
			"kind":       "Sidecar",
			"metadata": map[string]interface{}{
				"name":      name,
				"namespace": namespace,
				"labels": map[string]interface{}{
					"uds/package":    pkgName,
					"uds/generation": generation,
				},
			},
			"spec": map[string]interface{}{
				"outboundTrafficPolicy": map[string]interface{}{
					"mode": "REGISTRY_ONLY",
				},
			},
		},
	}
	setOwnerRefs(sc, ownerRefs)
	return sc
}

func buildAmbientEgressServiceEntry(host string, ports []hostPortProtocol, pkgIDs []string, ambientNS string) *unstructured.Unstructured {
	var portSpecs []interface{}
	seen := make(map[string]bool)

	for _, hpp := range ports {
		key := fmt.Sprintf("%s-%d", hpp.Protocol, hpp.Port)
		if seen[key] {
			continue
		}
		seen[key] = true
		portSpecs = append(portSpecs, map[string]interface{}{
			"name":     fmt.Sprintf("%s-%d", strings.ToLower(hpp.Protocol), hpp.Port),
			"number":   int64(hpp.Port),
			"protocol": hpp.Protocol,
		})
	}

	name := utils.SanitizeResourceName(fmt.Sprintf("ambient-se-%s", host))

	annotations := make(map[string]interface{})
	for _, id := range pkgIDs {
		annotations[fmt.Sprintf("uds.dev/user-%s", id)] = "user"
	}

	obj := map[string]interface{}{
		"apiVersion": "networking.istio.io/v1beta1",
		"kind":       "ServiceEntry",
		"metadata": map[string]interface{}{
			"name":      name,
			"namespace": ambientNS,
			"labels": map[string]interface{}{
				"uds/package":                     "shared-ambient-egress-resource",
				"istio.io/use-waypoint":           "egress-waypoint",
				"istio.io/use-waypoint-namespace": ambientEgressNS,
			},
		},
		"spec": map[string]interface{}{
			"hosts":      []interface{}{host},
			"location":   "MESH_EXTERNAL",
			"resolution": "DNS",
			"ports":      portSpecs,
			"exportTo":   []interface{}{"."},
		},
	}
	if len(annotations) > 0 {
		obj["metadata"].(map[string]interface{})["annotations"] = annotations
	}

	return &unstructured.Unstructured{Object: obj}
}

// buildEgressWaypointGateway creates the shared egress waypoint Gateway in istio-egress-ambient.
// This waypoint binds to ServiceEntries labeled with istio.io/use-waypoint=egress-waypoint
// and enforces the centralized ambient egress AuthorizationPolicies.
func buildEgressWaypointGateway(pkgIDs []string) *unstructured.Unstructured {
	annotations := make(map[string]interface{})
	for _, id := range pkgIDs {
		annotations[fmt.Sprintf("uds.dev/user-%s", id)] = "user"
	}

	obj := map[string]interface{}{
		"apiVersion": "gateway.networking.k8s.io/v1",
		"kind":       "Gateway",
		"metadata": map[string]interface{}{
			"name":        "egress-waypoint",
			"namespace":   ambientEgressNS,
			"annotations": annotations,
			"labels": map[string]interface{}{
				"uds/package":           "shared-ambient-egress-resource",
				"istio.io/gateway-name": "egress-waypoint",
			},
		},
		"spec": map[string]interface{}{
			"gatewayClassName": "istio-waypoint",
			"listeners": []interface{}{
				map[string]interface{}{
					"name":     "mesh",
					"port":     int64(15008),
					"protocol": "HBONE",
					"allowedRoutes": map[string]interface{}{
						"namespaces": map[string]interface{}{
							"from": "All",
						},
						"kinds": []interface{}{
							map[string]interface{}{
								"group": "networking.istio.io",
								"kind":  "ServiceEntry",
							},
						},
					},
				},
			},
			"infrastructure": map[string]interface{}{
				"parametersRef": map[string]interface{}{
					"group": "",
					"kind":  "ConfigMap",
					"name":  "egress-waypoint-config",
				},
			},
		},
	}

	return &unstructured.Unstructured{Object: obj}
}

func containsStr(slice []string, s string) bool {
	for _, v := range slice {
		if v == s {
			return true
		}
	}
	return false
}
