// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package istio

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"strings"

	udstypes "github.com/defenseunicorns/uds-core/src/go-controller/api/uds/v1alpha1"
	corev1 "k8s.io/api/core/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/types"
	corev1client "k8s.io/client-go/kubernetes/typed/core/v1"
)

const (
	injectionLabel           = "istio-injection"
	ambientLabel             = "istio.io/dataplane-mode"
	originalStateAnnotation  = "uds.dev/original-istio-state"
	restartPendingAnnotation = "uds.dev/istio-restart-pending"
)

// EnableIstio changes only the labels and annotations owned by the operator.
// A persistent restart marker makes a failed pod cycle recoverable after restart.
func EnableIstio(ctx context.Context, coreClient corev1client.CoreV1Interface, pkg *udstypes.UDSPackage) error {
	ns, err := coreClient.Namespaces().Get(ctx, pkg.Namespace, metav1.GetOptions{})
	if err != nil {
		return fmt.Errorf("get namespace: %w", err)
	}
	if ns.Annotations == nil {
		ns.Annotations = map[string]string{}
	}
	if _, ok := ns.Annotations[originalStateAnnotation]; !ok {
		ns.Annotations[originalStateAnnotation] = meshState(ns.Labels)
	}
	ns.Annotations["uds.dev/pkg-"+pkg.Name] = string(pkg.Spec.GetServiceMeshMode())
	return updateMesh(ctx, coreClient, ns, string(pkg.Spec.GetServiceMeshMode()), false, pkg.Name)
}

func CleanupNamespace(ctx context.Context, coreClient corev1client.CoreV1Interface, pkg *udstypes.UDSPackage) error {
	ns, err := coreClient.Namespaces().Get(ctx, pkg.Namespace, metav1.GetOptions{})
	if apierrors.IsNotFound(err) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("get namespace: %w", err)
	}
	target := ""
	for key := range ns.Annotations {
		if strings.HasPrefix(key, "uds.dev/pkg-") && key != "uds.dev/pkg-"+pkg.Name {
			target = meshState(ns.Labels)
			break
		}
	}
	if target != "" {
		return patchMeshMetadata(ctx, coreClient, ns, nil, map[string]interface{}{"uds.dev/pkg-" + pkg.Name: nil})
	}
	target = ns.Annotations[originalStateAnnotation]
	if target == "" {
		target = ns.Annotations[restartPendingAnnotation]
	}
	if target == "" { // No ownership marker: no namespace side effect occurred.
		return nil
	}
	return updateMesh(ctx, coreClient, ns, target, true, pkg.Name)
}

func meshState(labels map[string]string) string {
	if labels[injectionLabel] == "enabled" {
		return "sidecar"
	}
	if labels[ambientLabel] == "ambient" {
		return "ambient"
	}
	return "none"
}

func meshLabels(target string) map[string]interface{} {
	result := map[string]interface{}{injectionLabel: nil, ambientLabel: nil}
	switch {
	case target == "sidecar":
		result[injectionLabel] = "enabled"
	case target == "ambient":
		result[ambientLabel] = "ambient"
	// Accept state persisted by earlier Go candidates.
	case strings.HasPrefix(target, "injection-"):
		result[injectionLabel] = strings.TrimPrefix(target, "injection-")
	case strings.HasPrefix(target, "dataplane-"):
		result[ambientLabel] = strings.TrimPrefix(target, "dataplane-")
	}
	return result
}

func updateMesh(ctx context.Context, coreClient corev1client.CoreV1Interface, ns *corev1.Namespace, target string, cleanup bool, pkgName string) error {
	desiredLabels := meshLabels(target)
	wantSidecar := desiredLabels[injectionLabel] == "enabled"
	current := meshState(ns.Labels)
	restart := (wantSidecar && current != "sidecar") || (!wantSidecar && current == "sidecar") || ns.Annotations[restartPendingAnnotation] != ""
	annotations := map[string]interface{}{}
	if cleanup {
		annotations["uds.dev/pkg-"+pkgName] = nil
		annotations[originalStateAnnotation] = nil
	} else {
		annotations["uds.dev/pkg-"+pkgName] = ns.Annotations["uds.dev/pkg-"+pkgName]
		annotations[originalStateAnnotation] = ns.Annotations[originalStateAnnotation]
	}
	if restart {
		annotations[restartPendingAnnotation] = target
	}
	if err := patchMeshMetadata(ctx, coreClient, ns, desiredLabels, annotations); err != nil {
		return err
	}
	if !restart {
		return nil
	}
	if err := cycleMeshPods(ctx, coreClient, ns.Name, wantSidecar); err != nil {
		return err
	}
	// Re-fetch so a concurrent label change cannot be overwritten by stale data.
	latest, err := coreClient.Namespaces().Get(ctx, ns.Name, metav1.GetOptions{})
	if err != nil {
		return err
	}
	return patchMeshMetadata(ctx, coreClient, latest, nil, map[string]interface{}{restartPendingAnnotation: nil})
}

func patchMeshMetadata(ctx context.Context, coreClient corev1client.CoreV1Interface, ns *corev1.Namespace, labels, annotations map[string]interface{}) error {
	var err error
	ns, err = releaseNamespaceFields(ctx, coreClient, ns)
	if err != nil {
		return err
	}
	metadata := map[string]interface{}{"resourceVersion": ns.ResourceVersion, "annotations": annotations}
	if labels != nil {
		metadata["labels"] = labels
	}
	data, err := json.Marshal(map[string]interface{}{"metadata": metadata})
	if err != nil {
		return err
	}
	_, err = coreClient.Namespaces().Patch(ctx, ns.Name, types.MergePatchType, data, metav1.PatchOptions{})
	return err
}

func cycleMeshPods(ctx context.Context, coreClient corev1client.CoreV1Interface, namespace string, wantSidecar bool) error {
	pods, err := coreClient.Pods(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return err
	}
	// Reverse names cycle StatefulSet ordinals from highest to lowest.
	sort.Slice(pods.Items, func(i, j int) bool { return pods.Items[i].Name > pods.Items[j].Name })
	for _, pod := range pods.Items {
		if err := ctx.Err(); err != nil {
			return err
		}
		if pod.DeletionTimestamp != nil || pod.Status.Phase == corev1.PodSucceeded || pod.Status.Phase == corev1.PodFailed {
			continue
		}
		found := false
		for _, container := range append(pod.Spec.Containers, pod.Spec.InitContainers...) {
			if container.Name == "istio-proxy" {
				found = true
			}
		}
		if found == wantSidecar {
			continue
		}
		uid := pod.UID
		err := coreClient.Pods(namespace).Delete(ctx, pod.Name, metav1.DeleteOptions{Preconditions: &metav1.Preconditions{UID: &uid}})
		if err != nil && !apierrors.IsNotFound(err) {
			return fmt.Errorf("cycle pod %s/%s: %w", namespace, pod.Name, err)
		}
	}
	return nil
}
