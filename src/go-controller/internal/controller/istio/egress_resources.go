// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package istio

import (
	"context"
	"fmt"
	apierrors "k8s.io/apimachinery/pkg/api/errors"

	"sort"
	"strings"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"

	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/dynamic"

	"github.com/defenseunicorns/uds-core/src/go-controller/internal/utils"
)

func purgeAmbientEgressOrphans(ctx context.Context, client dynamic.Interface, appliedSENames, appliedAPNames map[string]bool) error {
	if err := purgeByNames(ctx, client, serviceEntryGVR, ambientEgressNS, "uds/package=shared-ambient-egress-resource", appliedSENames); err != nil {
		return err
	}
	return purgeByNames(ctx, client, egressAuthGVR, ambientEgressNS, "uds/package=shared-ambient-egress-resource,uds/for=egress", appliedAPNames)
}

func purgeByNames(ctx context.Context, client dynamic.Interface, gvr schema.GroupVersionResource, namespace, selector string, desired map[string]bool) error {
	list, err := client.Resource(gvr).Namespace(namespace).List(ctx, metav1.ListOptions{LabelSelector: selector})
	if err != nil {
		return err
	}
	for _, item := range list.Items {
		if desired[item.GetName()] {
			continue
		}
		uid, version := item.GetUID(), item.GetResourceVersion()
		if err := client.Resource(gvr).Namespace(namespace).Delete(ctx, item.GetName(), metav1.DeleteOptions{Preconditions: &metav1.Preconditions{UID: &uid, ResourceVersion: &version}}); err != nil && !apierrors.IsNotFound(err) {
			return err
		}
	}
	return nil
}

func buildLocalEgressServiceEntry(host string, ports []hostPortProtocol, pkgName, namespace, generation string, ownerRefs []metav1.OwnerReference) *unstructured.Unstructured {
	// Build unique port list
	var portSpecs []interface{}
	seen := make(map[string]bool)
	nameParts := []string{pkgName, "egress", utils.SanitizeResourceName(host)}

	for _, hpp := range sortedPorts(ports) {
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

	for _, hpp := range sortedPorts(ports) {
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

	sort.Strings(pkgIDs)
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
	sort.Strings(pkgIDs)
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
