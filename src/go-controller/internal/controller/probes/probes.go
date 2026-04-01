// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

// Package probes creates Prometheus Probe resources for uptime monitoring.
package probes

import (
	"context"
	"fmt"
	"log/slog"
	"strings"

	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/dynamic"
	"k8s.io/utils/ptr"

	udstypes "github.com/defenseunicorns/uds-core/src/go-controller/api/uds/v1alpha1"
	"github.com/defenseunicorns/uds-core/src/go-controller/internal/config"
	"github.com/defenseunicorns/uds-core/src/go-controller/internal/resources"
	"github.com/defenseunicorns/uds-core/src/go-controller/internal/utils"
)

var probeGVR = schema.GroupVersionResource{Group: "monitoring.coreos.com", Version: "v1", Resource: "probes"}

// ProbeResult contains the names of created probes and any SSO client IDs.
type ProbeResult struct {
	ProbeNames []string
	SSOClients []string
}

// Reconcile creates Probe resources for uptime monitoring.
func Reconcile(ctx context.Context, client dynamic.Interface, pkg *udstypes.UDSPackage, namespace string) (ProbeResult, error) {
	pkgName := pkg.Name
	generation := utils.PkgGeneration(pkg)
	ownerRefs := utils.GetOwnerRef(pkg)
	cfg := config.Get()

	var result ProbeResult

	slog.Debug("Probes reconcile started",
		"package", pkgName, "namespace", namespace,
		"exposeCount", len(pkg.Spec.GetExpose()))

	for _, expose := range pkg.Spec.GetExpose() {
		if expose.Uptime == nil || expose.Uptime.Checks == nil || len(expose.Uptime.Checks.Paths) == 0 {
			slog.Debug("Skipping expose without uptime checks",
				"package", pkgName, "host", expose.Host)
			continue
		}

		gateway := ptr.Deref(expose.Gateway, "")
		if gateway == "" {
			gateway = "tenant"
		}
		gateway = strings.ToLower(gateway)

		domain := cfg.Domain
		if gateway == "admin" {
			domain = cfg.AdminDomain
		}
		if expose.Domain != nil && *expose.Domain != "" {
			domain = *expose.Domain
		}
		fqdn := fmt.Sprintf("%s.%s", expose.Host, domain)

		// Build target URLs
		var targets []interface{}
		for _, path := range expose.Uptime.Checks.Paths {
			targets = append(targets, fmt.Sprintf("https://%s%s", fqdn, path))
		}

		module := "http_2xx"
		name := utils.SanitizeResourceName(fmt.Sprintf("uds-%s-%s-uptime", expose.Host, gateway))

		slog.Debug("Creating uptime Probe",
			"package", pkgName, "name", name,
			"fqdn", fqdn, "gateway", gateway,
			"module", module, "targets", targets,
			"paths", expose.Uptime.Checks.Paths)

		probe := &unstructured.Unstructured{
			Object: map[string]interface{}{
				"apiVersion": "monitoring.coreos.com/v1",
				"kind":       "Probe",
				"metadata": map[string]interface{}{
					"name":      name,
					"namespace": namespace,
					"labels": map[string]interface{}{
						"uds/package":    pkgName,
						"uds/generation": generation,
					},
				},
				"spec": map[string]interface{}{
					"module": module,
					"prober": map[string]interface{}{
						"url": "prometheus-blackbox-exporter.monitoring.svc.cluster.local:9115",
					},
					"targets": map[string]interface{}{
						"staticConfig": map[string]interface{}{
							"static": targets,
						},
					},
				},
			},
		}

		if len(ownerRefs) > 0 {
			var refMaps []interface{}
			for _, ref := range ownerRefs {
				refMaps = append(refMaps, map[string]interface{}{
					"apiVersion": ref.APIVersion,
					"kind":       ref.Kind,
					"name":       ref.Name,
					"uid":        string(ref.UID),
				})
			}
			unstructured.SetNestedSlice(probe.Object, refMaps, "metadata", "ownerReferences")
		}

		if err := resources.ServerSideApply(ctx, client, probeGVR, probe); err != nil {
			return result, fmt.Errorf("apply Probe %s: %w", name, err)
		}
		slog.Debug("Applied Probe", "name", name, "namespace", namespace)
		result.ProbeNames = append(result.ProbeNames, name)
	}

	// Purge orphans
	if err := resources.PurgeOrphans(ctx, client, probeGVR, namespace, pkgName, generation, nil); err != nil {
		slog.Error("Failed to purge orphaned Probes", "error", err)
	}

	return result, nil
}
