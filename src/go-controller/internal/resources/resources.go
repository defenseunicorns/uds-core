// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

// Package resources provides helpers for creating, applying, and purging
// Kubernetes resources using the dynamic client.
package resources

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
)

// Clients holds the Kubernetes clients used by resource operations.
type Clients struct {
	Dynamic   dynamic.Interface
	Clientset kubernetes.Interface
}

// ServerSideApply applies the given unstructured resource using server-side apply
// with force=true, similar to K8s(...).Apply(..., {force: true}) in Pepr.
func ServerSideApply(ctx context.Context, client dynamic.Interface, gvr schema.GroupVersionResource, obj *unstructured.Unstructured) error {
	slog.Debug("Server-side apply",
		"resource", gvr.Resource, "group", gvr.Group,
		"name", obj.GetName(), "namespace", obj.GetNamespace())

	data, err := json.Marshal(obj.Object)
	if err != nil {
		return fmt.Errorf("marshal resource: %w", err)
	}

	ns := obj.GetNamespace()
	var rc dynamic.ResourceInterface
	if ns != "" {
		rc = client.Resource(gvr).Namespace(ns)
	} else {
		rc = client.Resource(gvr)
	}

	_, err = rc.Patch(ctx, obj.GetName(), types.ApplyPatchType, data, metav1.PatchOptions{
		FieldManager: "uds-controller",
		Force:        boolPtr(true),
	})
	if err != nil {
		return fmt.Errorf("server-side apply %s/%s %s: %w", gvr.Resource, obj.GetNamespace(), obj.GetName(), err)
	}
	return nil
}

// PurgeOrphans deletes resources in namespace with matching package label but
// different generation label, mirroring the TypeScript purgeOrphans.
func PurgeOrphans(ctx context.Context, client dynamic.Interface, gvr schema.GroupVersionResource, namespace, pkgName, generation string, additionalLabels map[string]string) error {
	selector := fmt.Sprintf("uds/package=%s", pkgName)
	for k, v := range additionalLabels {
		selector += fmt.Sprintf(",%s=%s", k, v)
	}

	var rc dynamic.ResourceInterface
	if namespace != "" {
		rc = client.Resource(gvr).Namespace(namespace)
	} else {
		rc = client.Resource(gvr)
	}

	list, err := rc.List(ctx, metav1.ListOptions{
		LabelSelector: selector,
	})
	if err != nil {
		return fmt.Errorf("list %s for orphan purge: %w", gvr.Resource, err)
	}

	for _, item := range list.Items {
		labels := item.GetLabels()
		genLabel := labels["uds/generation"]
		if genLabel != generation {
			slog.Debug("Deleting orphaned resource",
				"kind", gvr.Resource,
				"name", item.GetName(),
				"namespace", item.GetNamespace(),
				"orphanGeneration", genLabel,
				"currentGeneration", generation,
			)
			if err := rc.Delete(ctx, item.GetName(), metav1.DeleteOptions{}); err != nil {
				slog.Error("Failed to delete orphaned resource",
					"kind", gvr.Resource,
					"name", item.GetName(),
					"error", err,
				)
			}
		}
	}
	return nil
}

func boolPtr(b bool) *bool { return &b }
