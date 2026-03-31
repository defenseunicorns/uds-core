// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package sso

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/kubernetes"

	udstypes "github.com/defenseunicorns/uds-core/src/go-controller/api/uds/v1alpha1"
	"github.com/defenseunicorns/uds-core/src/go-controller/internal/resources"
	"github.com/defenseunicorns/uds-core/src/go-controller/internal/utils"
)

var gatewayGVR = schema.GroupVersionResource{
	Group:    "gateway.networking.k8s.io",
	Version:  "v1",
	Resource: "gateways",
}

// ReconcileAuthserviceWaypoints creates a waypoint Gateway per authservice client
// and labels matching services and pods to route through it. Only runs in ambient mode.
func ReconcileAuthserviceWaypoints(ctx context.Context, dynamicClient dynamic.Interface, clientset kubernetes.Interface, pkg *udstypes.UDSPackage, namespace string) error {
	pkgName := pkg.Name
	generation := utils.PkgGeneration(pkg)
	ownerRefs := utils.GetOwnerRef(pkg)

	for _, ssoSpec := range pkg.Spec.Sso {
		if len(ssoSpec.EnableAuthserviceSelector) == 0 {
			continue
		}

		name := utils.SanitizeResourceName(ssoSpec.ClientID)
		waypointName := name + waypointSuffix

		slog.Debug("Reconciling authservice waypoint",
			"package", pkgName, "clientId", ssoSpec.ClientID, "waypoint", waypointName)

		// Create the waypoint Gateway
		gw := buildWaypointGateway(waypointName, namespace, pkgName, generation, ownerRefs)
		if err := resources.ServerSideApply(ctx, dynamicClient, gatewayGVR, gw); err != nil {
			return fmt.Errorf("apply waypoint Gateway %s: %w", waypointName, err)
		}
		slog.Debug("Applied waypoint Gateway", "name", waypointName, "namespace", namespace)

		// Label matching services and pods to use the waypoint
		if err := labelServicesForWaypoint(ctx, clientset, namespace, ssoSpec.EnableAuthserviceSelector, waypointName); err != nil {
			return fmt.Errorf("label services for waypoint %s: %w", waypointName, err)
		}
		if err := labelPodsForWaypoint(ctx, clientset, namespace, ssoSpec.EnableAuthserviceSelector, waypointName); err != nil {
			return fmt.Errorf("label pods for waypoint %s: %w", waypointName, err)
		}
	}

	// Purge orphaned waypoint Gateways (labeled with uds/package and stale generation)
	if err := resources.PurgeOrphans(ctx, dynamicClient, gatewayGVR, namespace, pkgName, generation, map[string]string{"app.kubernetes.io/component": "ambient-waypoint"}); err != nil {
		slog.Error("Failed to purge orphaned waypoint Gateways", "error", err)
	}

	return nil
}

// PurgeAuthserviceWaypoints removes waypoint labels from services/pods and deletes
// waypoint Gateways for a package being deleted.
func PurgeAuthserviceWaypoints(ctx context.Context, dynamicClient dynamic.Interface, clientset kubernetes.Interface, pkg *udstypes.UDSPackage, namespace string) {
	pkgName := pkg.Name

	for _, ssoSpec := range pkg.Spec.Sso {
		if len(ssoSpec.EnableAuthserviceSelector) == 0 {
			continue
		}

		name := utils.SanitizeResourceName(ssoSpec.ClientID)
		waypointName := name + waypointSuffix

		slog.Debug("Purging authservice waypoint",
			"package", pkgName, "waypoint", waypointName)

		removeWaypointLabelsFromServices(ctx, clientset, namespace, waypointName)
		// Pod label removal is skipped: patching running pods triggers admission webhooks that
		// attempt spec mutations (e.g. securityContext), which the API server rejects. The stale
		// use-waypoint label is harmless once the Gateway is deleted — Istio silently ignores
		// references to missing waypoints. Pods will be correctly labeled/unlabeled at
		// next creation via the mutating webhook.

		if err := dynamicClient.Resource(gatewayGVR).Namespace(namespace).Delete(ctx, waypointName, metav1.DeleteOptions{}); err != nil {
			slog.Debug("Waypoint Gateway not found or already deleted", "name", waypointName, "error", err)
		}
	}
}

func buildWaypointGateway(waypointName, namespace, pkgName, generation string, ownerRefs []metav1.OwnerReference) *unstructured.Unstructured {
	gw := &unstructured.Unstructured{
		Object: map[string]interface{}{
			"apiVersion": "gateway.networking.k8s.io/v1",
			"kind":       "Gateway",
			"metadata": map[string]interface{}{
				"name":      waypointName,
				"namespace": namespace,
				"labels": map[string]interface{}{
					"uds/package":                       pkgName,
					"uds/generation":                    generation,
					"uds/managed-by":                    "uds-operator",
					"app.kubernetes.io/component":       "ambient-waypoint",
					"istio.io/waypoint-for":             "all",
					"istio.io/gateway-name":             waypointName,
				},
			},
			"spec": map[string]interface{}{
				"gatewayClassName": "istio-waypoint",
				"listeners": []interface{}{
					map[string]interface{}{
						"name":     "mesh",
						"port":     int64(15008),
						"protocol": "HBONE",
					},
				},
			},
		},
	}

	if len(ownerRefs) > 0 {
		var refs []interface{}
		for _, r := range ownerRefs {
			refs = append(refs, map[string]interface{}{
				"apiVersion": r.APIVersion,
				"kind":       r.Kind,
				"name":       r.Name,
				"uid":        string(r.UID),
			})
		}
		unstructured.SetNestedSlice(gw.Object, refs, "metadata", "ownerReferences")
	}

	return gw
}

func labelServicesForWaypoint(ctx context.Context, clientset kubernetes.Interface, namespace string, selector map[string]string, waypointName string) error {
	svcs, err := clientset.CoreV1().Services(namespace).List(ctx, metav1.ListOptions{
		LabelSelector: labelSelectorString(selector),
	})
	if err != nil {
		return fmt.Errorf("list services: %w", err)
	}

	patch := mustMarshal([]map[string]interface{}{
		{"op": "add", "path": "/metadata/labels/istio.io~1use-waypoint", "value": waypointName},
		{"op": "add", "path": "/metadata/labels/istio.io~1ingress-use-waypoint", "value": "true"},
	})

	for _, svc := range svcs.Items {
		if _, err := clientset.CoreV1().Services(namespace).Patch(ctx, svc.Name, types.JSONPatchType, patch, metav1.PatchOptions{}); err != nil {
			slog.Error("Failed to label service for waypoint", "service", svc.Name, "waypoint", waypointName, "error", err)
		} else {
			slog.Debug("Labeled service for waypoint", "service", svc.Name, "waypoint", waypointName)
		}
	}
	return nil
}

func labelPodsForWaypoint(ctx context.Context, clientset kubernetes.Interface, namespace string, selector map[string]string, waypointName string) error {
	pods, err := clientset.CoreV1().Pods(namespace).List(ctx, metav1.ListOptions{
		LabelSelector: labelSelectorString(selector),
	})
	if err != nil {
		return fmt.Errorf("list pods: %w", err)
	}

	patch := mustMarshal([]map[string]interface{}{
		{"op": "add", "path": "/metadata/labels/istio.io~1use-waypoint", "value": waypointName},
	})

	for _, pod := range pods.Items {
		if _, err := clientset.CoreV1().Pods(namespace).Patch(ctx, pod.Name, types.JSONPatchType, patch, metav1.PatchOptions{}); err != nil {
			slog.Error("Failed to label pod for waypoint", "pod", pod.Name, "waypoint", waypointName, "error", err)
		} else {
			slog.Debug("Labeled pod for waypoint", "pod", pod.Name, "waypoint", waypointName)
		}
	}
	return nil
}

func removeWaypointLabelsFromServices(ctx context.Context, clientset kubernetes.Interface, namespace, waypointName string) {
	svcs, err := clientset.CoreV1().Services(namespace).List(ctx, metav1.ListOptions{
		LabelSelector: fmt.Sprintf("istio.io/use-waypoint=%s", waypointName),
	})
	if err != nil {
		slog.Error("Failed to list services for waypoint label cleanup", "error", err)
		return
	}

	patch := mustMarshal([]map[string]interface{}{
		{"op": "remove", "path": "/metadata/labels/istio.io~1use-waypoint"},
		{"op": "remove", "path": "/metadata/labels/istio.io~1ingress-use-waypoint"},
	})

	for _, svc := range svcs.Items {
		if _, err := clientset.CoreV1().Services(namespace).Patch(ctx, svc.Name, types.JSONPatchType, patch, metav1.PatchOptions{}); err != nil {
			slog.Error("Failed to remove waypoint labels from service", "service", svc.Name, "error", err)
		}
	}
}

func removeWaypointLabelsFromPods(ctx context.Context, clientset kubernetes.Interface, namespace, waypointName string) {
	pods, err := clientset.CoreV1().Pods(namespace).List(ctx, metav1.ListOptions{
		LabelSelector: fmt.Sprintf("istio.io/use-waypoint=%s", waypointName),
	})
	if err != nil {
		slog.Error("Failed to list pods for waypoint label cleanup", "error", err)
		return
	}

	patch := mustMarshal([]map[string]interface{}{
		{"op": "remove", "path": "/metadata/labels/istio.io~1use-waypoint"},
	})

	for _, pod := range pods.Items {
		if _, err := clientset.CoreV1().Pods(namespace).Patch(ctx, pod.Name, types.JSONPatchType, patch, metav1.PatchOptions{}); err != nil {
			slog.Error("Failed to remove waypoint label from pod", "pod", pod.Name, "error", err)
		}
	}
}

func labelSelectorString(selector map[string]string) string {
	var parts []string
	for k, v := range selector {
		parts = append(parts, fmt.Sprintf("%s=%s", k, v))
	}
	result := ""
	for i, p := range parts {
		if i > 0 {
			result += ","
		}
		result += p
	}
	return result
}

func mustMarshal(v interface{}) []byte {
	data, err := json.Marshal(v)
	if err != nil {
		panic(fmt.Sprintf("mustMarshal: %v", err))
	}
	return data
}
