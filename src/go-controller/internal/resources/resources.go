// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

// Package resources provides helpers for creating, applying, and purging
// Kubernetes resources using the dynamic client.
package resources

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
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

	ns := obj.GetNamespace()
	var rc dynamic.ResourceInterface
	if ns != "" {
		rc = client.Resource(gvr).Namespace(ns)
	} else {
		rc = client.Resource(gvr)
	}
	if desired := obj.GetOwnerReferences(); len(desired) > 0 {
		existing, err := rc.Get(ctx, obj.GetName(), metav1.GetOptions{})
		if err != nil && !apierrors.IsNotFound(err) {
			return err
		}
		if err == nil {
			for _, owner := range existing.GetOwnerReferences() {
				if owner.Kind != "Package" || owner.APIVersion != "uds.dev/v1alpha1" {
					continue
				}
				matched := false
				for _, wanted := range desired {
					if owner.UID == wanted.UID {
						matched = true
					}
				}
				if !matched {
					return fmt.Errorf("%s %s/%s is owned by another Package UID %s", gvr.Resource, ns, obj.GetName(), owner.UID)
				}
			}
			if existing.GetResourceVersion() != "" {
				obj.SetResourceVersion(existing.GetResourceVersion())
			}
		}
	}
	data, err := json.Marshal(obj.Object)
	if err != nil {
		return fmt.Errorf("marshal resource: %w", err)
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

// OwnedByPackage verifies durable ownership; mutable discovery labels are not
// authority to remove another Package's resources.
func OwnedByPackage(object metav1.Object, packageUID types.UID) bool {
	if packageUID == "" {
		return false
	}
	matched := false
	for _, owner := range object.GetOwnerReferences() {
		if owner.APIVersion != "uds.dev/v1alpha1" || owner.Kind != "Package" {
			continue
		}
		if owner.UID != packageUID {
			return false
		}
		matched = true
	}
	return matched
}

// PurgeOrphans removes stale generated resources owned by the current Package
// UID. Names and labels only discover candidates, never establish ownership.
func PurgeOrphans(ctx context.Context, client dynamic.Interface, gvr schema.GroupVersionResource, namespace, pkgName, generation string, additionalLabels map[string]string, packageUID types.UID) error {
	if packageUID == "" {
		return fmt.Errorf("cannot purge %s without Package UID", gvr.Resource)
	}
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

	var failures []error
	for _, item := range list.Items {
		if err := ctx.Err(); err != nil {
			return err
		}
		if !OwnedByPackage(&item, packageUID) {
			continue
		}
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
			uid, version := item.GetUID(), item.GetResourceVersion()
			if err := rc.Delete(ctx, item.GetName(), metav1.DeleteOptions{Preconditions: &metav1.Preconditions{UID: &uid, ResourceVersion: &version}}); err != nil && !apierrors.IsNotFound(err) {
				failures = append(failures, fmt.Errorf("delete %s %s: %w", gvr.Resource, item.GetName(), err))
				slog.Error("Failed to delete orphaned resource",
					"kind", gvr.Resource,
					"name", item.GetName(),
					"error", err,
				)
			}
		}
	}
	return errors.Join(failures...)
}

func boolPtr(b bool) *bool { return &b }
