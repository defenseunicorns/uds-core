// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

// Package monitoring creates Prometheus PodMonitor and ServiceMonitor resources.
package monitoring

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
	podMonitorGVR     = schema.GroupVersionResource{Group: "monitoring.coreos.com", Version: "v1", Resource: "podmonitors"}
	serviceMonitorGVR = schema.GroupVersionResource{Group: "monitoring.coreos.com", Version: "v1", Resource: "servicemonitors"}
)

// ReconcilePodMonitors creates PodMonitor resources and returns their names.
func ReconcilePodMonitors(ctx context.Context, client dynamic.Interface, pkg *udstypes.UDSPackage, namespace string) ([]string, error) {
	pkgName := pkg.Name
	generation := utils.PkgGeneration(pkg)
	ownerRefs := utils.GetOwnerRef(pkg)

	var names []string

	slog.Debug("PodMonitor reconcile started",
		"package", pkgName, "namespace", namespace,
		"totalMonitors", len(pkg.Spec.Monitor))

	for _, monitor := range pkg.Spec.Monitor {
		if monitor.Kind == nil || *monitor.Kind != udstypes.PodMonitor {
			continue
		}

		name := generateMonitorName(pkgName, monitor)
		path := "/metrics"
		if monitor.Path != nil {
			path = *monitor.Path
		}
		slog.Debug("Creating PodMonitor",
			"package", pkgName, "name", name,
			"portName", monitor.PortName, "path", path,
			"selector", monitor.Selector)

		fallbackProtocol := "PrometheusText0.0.4"
		if monitor.FallbackScrapeProtocol != nil {
			fallbackProtocol = string(*monitor.FallbackScrapeProtocol)
		}

		selector := monitor.Selector
		if len(monitor.PodSelector) > 0 {
			selector = monitor.PodSelector
		}

		endpoint := map[string]interface{}{
			"port": monitor.PortName,
			"path": path,
		}
		if monitor.Authorization != nil {
			auth := map[string]interface{}{
				"credentials": map[string]interface{}{
					"key": monitor.Authorization.Credentials.Key,
				},
			}
			if monitor.Authorization.Credentials.Name != nil {
				auth["credentials"].(map[string]interface{})["name"] = *monitor.Authorization.Credentials.Name
			}
			if monitor.Authorization.Type != nil {
				auth["type"] = *monitor.Authorization.Type
			}
			endpoint["authorization"] = auth
		}

		pm := &unstructured.Unstructured{
			Object: map[string]interface{}{
				"apiVersion": "monitoring.coreos.com/v1",
				"kind":       "PodMonitor",
				"metadata": map[string]interface{}{
					"name":      name,
					"namespace": namespace,
					"labels": map[string]interface{}{
						"uds/package":    pkgName,
						"uds/generation": generation,
					},
				},
				"spec": map[string]interface{}{
					"podMetricsEndpoints":    []interface{}{endpoint},
					"selector":               map[string]interface{}{"matchLabels": toInterfaceMap(selector)},
					"fallbackScrapeProtocol": fallbackProtocol,
				},
			},
		}
		setOwnerRefs(pm, ownerRefs)

		if err := resources.ServerSideApply(ctx, client, podMonitorGVR, pm); err != nil {
			return nil, fmt.Errorf("apply PodMonitor %s: %w", name, err)
		}
		slog.Debug("Applied PodMonitor", "name", name, "namespace", namespace)
		names = append(names, name)
	}

	if err := resources.PurgeOrphans(ctx, client, podMonitorGVR, namespace, pkgName, generation, nil); err != nil {
		slog.Error("Failed to purge orphaned PodMonitors", "error", err)
	}

	return names, nil
}

// ReconcileServiceMonitors creates ServiceMonitor resources and returns their names.
func ReconcileServiceMonitors(ctx context.Context, client dynamic.Interface, pkg *udstypes.UDSPackage, namespace string) ([]string, error) {
	pkgName := pkg.Name
	generation := utils.PkgGeneration(pkg)
	ownerRefs := utils.GetOwnerRef(pkg)

	var names []string

	slog.Debug("ServiceMonitor reconcile started",
		"package", pkgName, "namespace", namespace,
		"totalMonitors", len(pkg.Spec.Monitor))

	for _, monitor := range pkg.Spec.Monitor {
		// ServiceMonitor is the default kind
		if monitor.Kind != nil && *monitor.Kind == udstypes.PodMonitor {
			continue
		}

		slog.Debug("Creating ServiceMonitor",
			"package", pkgName, "portName", monitor.PortName,
			"selector", monitor.Selector,
			"targetPort", monitor.TargetPort)

		name := generateMonitorName(pkgName, monitor)
		path := "/metrics"
		if monitor.Path != nil {
			path = *monitor.Path
		}

		fallbackProtocol := "PrometheusText0.0.4"
		if monitor.FallbackScrapeProtocol != nil {
			fallbackProtocol = string(*monitor.FallbackScrapeProtocol)
		}

		endpoint := map[string]interface{}{
			"port": monitor.PortName,
			"path": path,
		}
		if monitor.Authorization != nil {
			auth := map[string]interface{}{
				"credentials": map[string]interface{}{
					"key": monitor.Authorization.Credentials.Key,
				},
			}
			if monitor.Authorization.Credentials.Name != nil {
				auth["credentials"].(map[string]interface{})["name"] = *monitor.Authorization.Credentials.Name
			}
			if monitor.Authorization.Type != nil {
				auth["type"] = *monitor.Authorization.Type
			}
			endpoint["authorization"] = auth
		}

		sm := &unstructured.Unstructured{
			Object: map[string]interface{}{
				"apiVersion": "monitoring.coreos.com/v1",
				"kind":       "ServiceMonitor",
				"metadata": map[string]interface{}{
					"name":      name,
					"namespace": namespace,
					"labels": map[string]interface{}{
						"uds/package":    pkgName,
						"uds/generation": generation,
					},
				},
				"spec": map[string]interface{}{
					"endpoints":              []interface{}{endpoint},
					"selector":               map[string]interface{}{"matchLabels": toInterfaceMap(monitor.Selector)},
					"fallbackScrapeProtocol": fallbackProtocol,
				},
			},
		}
		setOwnerRefs(sm, ownerRefs)

		if err := resources.ServerSideApply(ctx, client, serviceMonitorGVR, sm); err != nil {
			return nil, fmt.Errorf("apply ServiceMonitor %s: %w", name, err)
		}
		slog.Debug("Applied ServiceMonitor", "name", name, "namespace", namespace)
		names = append(names, name)
	}

	if err := resources.PurgeOrphans(ctx, client, serviceMonitorGVR, namespace, pkgName, generation, nil); err != nil {
		slog.Error("Failed to purge orphaned ServiceMonitors", "error", err)
	}

	return names, nil
}

func generateMonitorName(pkgName string, monitor udstypes.Monitor) string {
	if monitor.Description != nil && *monitor.Description != "" {
		return utils.SanitizeResourceName(fmt.Sprintf("%s-%s", pkgName, *monitor.Description))
	}
	vals := joinMapValues(monitor.Selector)
	return utils.SanitizeResourceName(fmt.Sprintf("%s-%s-%s", pkgName, vals, monitor.PortName))
}

func joinMapValues(m map[string]string) string {
	vals := make([]string, 0, len(m))
	for _, v := range m {
		vals = append(vals, v)
	}
	return strings.Join(vals, "-")
}

func toInterfaceMap(m map[string]string) map[string]interface{} {
	result := make(map[string]interface{}, len(m))
	for k, v := range m {
		result[k] = v
	}
	return result
}

func setOwnerRefs(obj *unstructured.Unstructured, refs []metav1.OwnerReference) {
	if len(refs) > 0 {
		var refMaps []interface{}
		for _, ref := range refs {
			refMaps = append(refMaps, map[string]interface{}{
				"apiVersion": ref.APIVersion,
				"kind":       ref.Kind,
				"name":       ref.Name,
				"uid":        string(ref.UID),
			})
		}
		unstructured.SetNestedSlice(obj.Object, refMaps, "metadata", "ownerReferences")
	}
}
