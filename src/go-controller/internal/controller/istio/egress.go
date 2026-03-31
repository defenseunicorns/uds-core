// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package istio

import (
	"context"
	"fmt"
	"log/slog"
	"strings"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/dynamic"

	udstypes "github.com/defenseunicorns/uds-core/src/go-controller/api/uds/v1alpha1"
	"github.com/defenseunicorns/uds-core/src/go-controller/internal/resources"
	"github.com/defenseunicorns/uds-core/src/go-controller/internal/utils"
)

var (
	sidecarGVR = schema.GroupVersionResource{Group: "networking.istio.io", Version: "v1beta1", Resource: "sidecars"}
)

// hostPortProtocol groups allow rules by remote host.
type hostPortProtocol struct {
	Host     string
	Port     int32
	Protocol string // "TLS" or "HTTP"
}

// ReconcileEgress creates egress ServiceEntries and Sidecars for external traffic.
func ReconcileEgress(ctx context.Context, client dynamic.Interface, pkg *udstypes.UDSPackage, namespace string) error {
	pkgName := pkg.Name
	generation := utils.PkgGeneration(pkg)
	ownerRefs := utils.GetOwnerRef(pkg)
	istioMode := pkg.Spec.GetServiceMeshMode()

	slog.Debug("Istio egress reconcile started",
		"package", pkgName, "namespace", namespace,
		"istioMode", istioMode,
		"allowRules", len(pkg.Spec.GetAllow()))

	// Collect all egress allow rules with remoteHost
	hostMap := make(map[string][]hostPortProtocol)
	for _, allow := range pkg.Spec.GetAllow() {
		if allow.Direction != udstypes.Egress || allow.RemoteHost == nil {
			continue
		}

		port := int32(443)
		if allow.Port != nil {
			port = int32(*allow.Port)
		}

		protocol := "TLS"
		if allow.RemoteProtocol != nil && *allow.RemoteProtocol == udstypes.HTTP {
			protocol = "HTTP"
		}

		hpp := hostPortProtocol{
			Host:     *allow.RemoteHost,
			Port:     port,
			Protocol: protocol,
		}
		hostMap[*allow.RemoteHost] = append(hostMap[*allow.RemoteHost], hpp)
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

	return reconcileAmbientEgress(ctx, client, pkg, pkgName, namespace, generation, hostMap)
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

func reconcileAmbientEgress(ctx context.Context, client dynamic.Interface, pkg *udstypes.UDSPackage, pkgName, namespace, generation string, hostMap map[string][]hostPortProtocol) error {
	// For ambient mode, create ServiceEntries in istio-egress-ambient namespace
	ambientNS := "istio-egress-ambient"
	pkgID := fmt.Sprintf("%s-%s", namespace, pkgName)

	for host, ports := range hostMap {
		se := buildAmbientEgressServiceEntry(host, ports, pkgID, ambientNS, generation)
		if err := resources.ServerSideApply(ctx, client, serviceEntryGVR, se); err != nil {
			return fmt.Errorf("apply ambient egress ServiceEntry for %s: %w", host, err)
		}
		slog.Debug("Applied ambient egress ServiceEntry", "name", se.GetName(), "host", host)
	}

	return nil
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

func buildAmbientEgressServiceEntry(host string, ports []hostPortProtocol, pkgID, ambientNS, generation string) *unstructured.Unstructured {
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

	return &unstructured.Unstructured{
		Object: map[string]interface{}{
			"apiVersion": "networking.istio.io/v1beta1",
			"kind":       "ServiceEntry",
			"metadata": map[string]interface{}{
				"name":      name,
				"namespace": ambientNS,
				"labels": map[string]interface{}{
					"uds/package":                      "shared-ambient-egress-resource",
					"uds/generation":                   generation,
					"istio.io/use-waypoint":            "egress-waypoint",
					"istio.io/use-waypoint-namespace":  "istio-egress-ambient",
				},
				"annotations": map[string]interface{}{
					fmt.Sprintf("uds.dev/user-%s", pkgID): "user",
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
}
