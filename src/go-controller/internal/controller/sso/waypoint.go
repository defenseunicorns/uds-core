// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package sso

import (
	"context"
	"encoding/json"
	"fmt"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
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
		if ssoSpec.EnableAuthserviceSelector == nil {
			continue
		}

		waypointName := utils.WaypointName(ssoSpec.ClientID)

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

	desired := map[string]bool{}
	for _, entry := range pkg.Spec.Sso {
		if entry.EnableAuthserviceSelector != nil {
			desired[utils.WaypointName(entry.ClientID)] = true
		}
	}
	for _, old := range pkg.Status.AuthserviceClients {
		name := utils.WaypointName(old.ClientID)
		if !desired[name] {
			if err := removeWaypointLabelsFromServices(ctx, clientset, namespace, name); err != nil {
				return err
			}
			if err := removeWaypointLabelsFromPods(ctx, clientset, namespace, name); err != nil {
				return err
			}
		}
	}
	// Purge orphaned waypoint Gateways (labeled with uds/package and stale generation)
	if err := resources.PurgeOrphans(ctx, dynamicClient, gatewayGVR, namespace, pkgName, generation, map[string]string{"app.kubernetes.io/component": "ambient-waypoint"}, pkg.UID); err != nil {
		return err
	}

	return nil
}

// PurgeAuthserviceWaypoints removes waypoint labels from services/pods and deletes
// waypoint Gateways for a package being deleted.
func PurgeAuthserviceWaypoints(ctx context.Context, dynamicClient dynamic.Interface, clientset kubernetes.Interface, pkg *udstypes.UDSPackage, namespace string) error {
	names := map[string]bool{}
	for _, entry := range pkg.Spec.Sso {
		if entry.EnableAuthserviceSelector != nil {
			names[utils.WaypointName(entry.ClientID)] = true
		}
	}
	for _, entry := range pkg.Status.AuthserviceClients {
		names[utils.WaypointName(entry.ClientID)] = true
	}
	gateways, err := dynamicClient.Resource(gatewayGVR).Namespace(namespace).List(ctx, metav1.ListOptions{LabelSelector: "uds/package=" + pkg.Name + ",app.kubernetes.io/component=ambient-waypoint"})
	if err != nil {
		return err
	}
	for _, gw := range gateways.Items {
		if resources.OwnedByPackage(&gw, pkg.UID) {
			names[gw.GetName()] = true
		}
	}
	for name := range names {
		gateway, err := dynamicClient.Resource(gatewayGVR).Namespace(namespace).Get(ctx, name, metav1.GetOptions{})
		if err != nil && !apierrors.IsNotFound(err) {
			return err
		}
		if err == nil && !resources.OwnedByPackage(gateway, pkg.UID) {
			// Distinct valid client IDs can sanitize to the same Gateway name.
			// An owner-rejected apply never authorizes cleanup of that Gateway
			// or its routing labels when the failed Package is finalized.
			continue
		}
		if err := removeWaypointLabelsFromServices(ctx, clientset, namespace, name); err != nil {
			return err
		}
		if err := removeWaypointLabelsFromPods(ctx, clientset, namespace, name); err != nil {
			return err
		}
		if gateway == nil {
			continue
		}
		uid, version := gateway.GetUID(), gateway.GetResourceVersion()
		if err := dynamicClient.Resource(gatewayGVR).Namespace(namespace).Delete(ctx, name, metav1.DeleteOptions{Preconditions: &metav1.Preconditions{UID: &uid, ResourceVersion: &version}}); err != nil && !apierrors.IsNotFound(err) {
			return err
		}
	}
	return nil
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
					"uds/package":                 pkgName,
					"uds/generation":              generation,
					"uds/managed-by":              "uds-operator",
					"app.kubernetes.io/component": "ambient-waypoint",
					"istio.io/waypoint-for":       "all",
					"istio.io/gateway-name":       waypointName,
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
	services, err := clientset.CoreV1().Services(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return err
	}
	for _, svc := range services.Items {
		matches := labelsMatch(svc.Spec.Selector, selector)
		if !matches && svc.Labels["istio.io/use-waypoint"] != waypointName {
			continue
		}
		desired := map[string]interface{}{"istio.io/use-waypoint": nil, "istio.io/ingress-use-waypoint": nil}
		if matches {
			desired["istio.io/use-waypoint"] = waypointName
			desired["istio.io/ingress-use-waypoint"] = "true"
		}
		if matches && svc.Labels["istio.io/use-waypoint"] == waypointName && svc.Labels["istio.io/ingress-use-waypoint"] == "true" {
			continue
		}
		patch := mustMarshal(map[string]interface{}{"metadata": map[string]interface{}{"resourceVersion": svc.ResourceVersion, "labels": desired}})
		if _, err := clientset.CoreV1().Services(namespace).Patch(ctx, svc.Name, types.MergePatchType, patch, metav1.PatchOptions{}); err != nil {
			return err
		}
	}
	return nil
}
func labelPodsForWaypoint(ctx context.Context, clientset kubernetes.Interface, namespace string, selector map[string]string, waypointName string) error {
	pods, err := clientset.CoreV1().Pods(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return err
	}
	for _, pod := range pods.Items {
		if pod.DeletionTimestamp != nil {
			continue
		}
		matches := labelsMatch(pod.Labels, selector)
		if !matches && pod.Labels["istio.io/use-waypoint"] != waypointName {
			continue
		}
		if matches && pod.Labels["istio.io/use-waypoint"] == waypointName {
			continue
		}
		var desired interface{}
		if matches {
			desired = waypointName
		}
		patch := mustMarshal(map[string]interface{}{"metadata": map[string]interface{}{"resourceVersion": pod.ResourceVersion, "labels": map[string]interface{}{"istio.io/use-waypoint": desired}}})
		if _, err := clientset.CoreV1().Pods(namespace).Patch(ctx, pod.Name, types.MergePatchType, patch, metav1.PatchOptions{}); err != nil && !apierrors.IsNotFound(err) {
			return err
		}
	}
	return nil
}
func removeWaypointLabelsFromServices(ctx context.Context, clientset kubernetes.Interface, namespace, waypointName string) error {
	services, err := clientset.CoreV1().Services(namespace).List(ctx, metav1.ListOptions{LabelSelector: "istio.io/use-waypoint=" + waypointName})
	if err != nil {
		return err
	}
	for _, svc := range services.Items {
		patch := mustMarshal(map[string]interface{}{"metadata": map[string]interface{}{"resourceVersion": svc.ResourceVersion, "labels": map[string]interface{}{"istio.io/use-waypoint": nil, "istio.io/ingress-use-waypoint": nil}}})
		if _, err := clientset.CoreV1().Services(namespace).Patch(ctx, svc.Name, types.MergePatchType, patch, metav1.PatchOptions{}); err != nil && !apierrors.IsNotFound(err) {
			return err
		}
	}
	return nil
}
func removeWaypointLabelsFromPods(ctx context.Context, clientset kubernetes.Interface, namespace, waypointName string) error {
	pods, err := clientset.CoreV1().Pods(namespace).List(ctx, metav1.ListOptions{LabelSelector: "istio.io/use-waypoint=" + waypointName})
	if err != nil {
		return err
	}
	for _, pod := range pods.Items {
		if pod.DeletionTimestamp != nil {
			continue
		}
		patch := mustMarshal(map[string]interface{}{"metadata": map[string]interface{}{"resourceVersion": pod.ResourceVersion, "labels": map[string]interface{}{"istio.io/use-waypoint": nil}}})
		if _, err := clientset.CoreV1().Pods(namespace).Patch(ctx, pod.Name, types.MergePatchType, patch, metav1.PatchOptions{}); err != nil && !apierrors.IsNotFound(err) {
			return err
		}
	}
	return nil
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
