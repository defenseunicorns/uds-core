// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
package reload

import (
	"context"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
	"k8s.io/utils/ptr"
)

// Workload templates remain consumers even during a rollout with no live Pods.
// Represent them as direct controller targets so ReloadPods retains its UID
// checks, per-content deduplication, and Events. Actual Pods still cover bare
// Pods and controllers whose old Pods reference the changed configuration.
func controllerConsumers(ctx context.Context, client kubernetes.Interface, namespace, kind, name string, selector map[string]string) ([]corev1.Pod, error) {
	var pods []corev1.Pod
	add := func(owner metav1.Object, ownerKind string, template corev1.PodTemplateSpec) {
		if owner.GetDeletionTimestamp() != nil {
			return
		}
		matches := References(template.Spec, kind, name)
		if len(selector) > 0 {
			matches = labelsMatch(template.Labels, selector)
		}
		if !matches {
			return
		}
		pods = append(pods, corev1.Pod{ObjectMeta: metav1.ObjectMeta{Namespace: namespace, OwnerReferences: []metav1.OwnerReference{{APIVersion: "apps/v1", Kind: ownerKind, Name: owner.GetName(), UID: owner.GetUID(), Controller: ptr.To(true)}}}})
	}
	deployments, err := client.AppsV1().Deployments(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}
	for _, obj := range deployments.Items {
		add(&obj, "Deployment", obj.Spec.Template)
	}
	statefulSets, err := client.AppsV1().StatefulSets(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}
	for _, obj := range statefulSets.Items {
		add(&obj, "StatefulSet", obj.Spec.Template)
	}
	daemonSets, err := client.AppsV1().DaemonSets(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}
	for _, obj := range daemonSets.Items {
		add(&obj, "DaemonSet", obj.Spec.Template)
	}
	return pods, nil
}
