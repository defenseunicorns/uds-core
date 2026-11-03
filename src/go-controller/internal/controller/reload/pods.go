// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package reload

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	corev1 "k8s.io/api/core/v1"
	policyv1 "k8s.io/api/policy/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/labels"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/client-go/kubernetes"
	"strings"
	"time"
)

func ParseSelector(value string) (map[string]string, error) {
	result := map[string]string{}
	for _, pair := range strings.Split(value, ",") {
		parts := strings.Split(pair, "=")
		if len(parts) != 2 || strings.TrimSpace(parts[0]) == "" || strings.TrimSpace(parts[1]) == "" {
			return nil, fmt.Errorf("invalid %s: %q", selectorAnnotation, value)
		}
		result[strings.TrimSpace(parts[0])] = strings.TrimSpace(parts[1])
	}
	if _, err := labels.ValidatedSelectorFromSet(result); err != nil {
		return nil, err
	}
	return result, nil
}
func labelsMatch(target, selector map[string]string) bool {
	for key, value := range selector {
		if target[key] != value {
			return false
		}
	}
	return true
}

// References includes projected volumes and both regular and init containers.
func References(spec corev1.PodSpec, kind, name string) bool {
	for _, volume := range spec.Volumes {
		if kind == "Secret" && volume.Secret != nil && volume.Secret.SecretName == name {
			return true
		}
		if kind == "ConfigMap" && volume.ConfigMap != nil && volume.ConfigMap.Name == name {
			return true
		}
		if volume.Projected != nil {
			for _, source := range volume.Projected.Sources {
				if kind == "Secret" && source.Secret != nil && source.Secret.Name == name {
					return true
				}
				if kind == "ConfigMap" && source.ConfigMap != nil && source.ConfigMap.Name == name {
					return true
				}
			}
		}
	}
	containers := append(append([]corev1.Container(nil), spec.Containers...), spec.InitContainers...)
	for _, container := range containers {
		for _, env := range container.Env {
			if env.ValueFrom == nil {
				continue
			}
			if kind == "Secret" && env.ValueFrom.SecretKeyRef != nil && env.ValueFrom.SecretKeyRef.Name == name {
				return true
			}
			if kind == "ConfigMap" && env.ValueFrom.ConfigMapKeyRef != nil && env.ValueFrom.ConfigMapKeyRef.Name == name {
				return true
			}
		}
		for _, env := range container.EnvFrom {
			if kind == "Secret" && env.SecretRef != nil && env.SecretRef.Name == name {
				return true
			}
			if kind == "ConfigMap" && env.ConfigMapRef != nil && env.ConfigMapRef.Name == name {
				return true
			}
		}
	}
	return false
}

type target struct {
	Kind, Name string
	UID        types.UID
}

func controllerTarget(ctx context.Context, client kubernetes.Interface, namespace string, pod corev1.Pod) (*target, error) {
	var ref *metav1.OwnerReference
	for i := range pod.OwnerReferences {
		if pod.OwnerReferences[i].Controller != nil && *pod.OwnerReferences[i].Controller {
			ref = &pod.OwnerReferences[i]
			break
		}
	}
	if ref == nil {
		return nil, nil
	}
	if ref.Kind == "ReplicaSet" {
		rs, err := client.AppsV1().ReplicaSets(namespace).Get(ctx, ref.Name, metav1.GetOptions{})
		if err != nil {
			return nil, err
		}
		if rs.UID != ref.UID {
			return nil, fmt.Errorf("ReplicaSet replaced before reload")
		}
		for _, parent := range rs.OwnerReferences {
			if parent.Kind == "Deployment" && parent.Controller != nil && *parent.Controller {
				return &target{"Deployment", parent.Name, parent.UID}, nil
			}
		}
		// ReplicaSets do not roll existing pods when their template changes.
		return nil, nil
	}
	switch ref.Kind {
	case "Deployment", "StatefulSet", "DaemonSet":
		return &target{ref.Kind, ref.Name, ref.UID}, nil
	}
	return nil, nil
}

func ReloadPods(ctx context.Context, client kubernetes.Interface, namespace string, pods []corev1.Pod, message, reason, token string) error {
	handled := map[target]bool{}
	for _, pod := range pods {
		if err := ctx.Err(); err != nil {
			return err
		}
		if pod.DeletionTimestamp != nil || pod.Status.Phase == corev1.PodSucceeded || pod.Status.Phase == corev1.PodFailed {
			continue
		}
		owner, err := controllerTarget(ctx, client, namespace, pod)
		if apierrors.IsNotFound(err) {
			continue
		}
		if err != nil {
			return err
		}
		if owner == nil {
			uid := pod.UID
			err := client.CoreV1().Pods(namespace).EvictV1(ctx, &policyv1.Eviction{ObjectMeta: metav1.ObjectMeta{Name: pod.Name, Namespace: namespace}, DeleteOptions: &metav1.DeleteOptions{Preconditions: &metav1.Preconditions{UID: &uid}}})
			if err != nil && !apierrors.IsNotFound(err) {
				return err
			}
			continue
		}
		if handled[*owner] {
			continue
		}
		if err := restartController(ctx, client, namespace, *owner, message, reason, token); err != nil {
			return err
		}
		handled[*owner] = true
	}
	return nil
}

func restartController(ctx context.Context, client kubernetes.Interface, namespace string, owner target, message, reason, token string) error {
	obj, err := getController(ctx, client, namespace, owner)
	if err != nil {
		return err
	}
	if obj.GetUID() != owner.UID {
		return fmt.Errorf("%s %s replaced before reload", owner.Kind, owner.Name)
	}
	marker := fmt.Sprintf("uds.dev/reload-%x", sha256.Sum256([]byte(token[:strings.LastIndex(token, "/")+1])))[:len("uds.dev/reload-")+16]
	checksum := fmt.Sprintf("%x", sha256.Sum256([]byte(token)))
	if obj.GetAnnotations()[marker] == checksum {
		return nil
	}
	patch, _ := json.Marshal(map[string]interface{}{"metadata": map[string]interface{}{"resourceVersion": obj.GetResourceVersion(), "annotations": map[string]string{marker: checksum}}, "spec": map[string]interface{}{"template": map[string]interface{}{"metadata": map[string]interface{}{"annotations": map[string]string{"uds.dev/restartedAt": time.Now().UTC().Format(time.RFC3339Nano)}}}}})
	if err := patchController(ctx, client, namespace, owner, types.MergePatchType, patch); err != nil {
		return err
	}
	_, err = client.CoreV1().Events(namespace).Create(ctx, &corev1.Event{ObjectMeta: metav1.ObjectMeta{GenerateName: owner.Name + "-reload-", Namespace: namespace}, InvolvedObject: corev1.ObjectReference{APIVersion: "apps/v1", Kind: owner.Kind, Name: owner.Name, Namespace: namespace, UID: owner.UID}, Reason: reason, Message: "Restarted due to: " + message, Type: corev1.EventTypeNormal, Source: corev1.EventSource{Component: "uds-controller"}, FirstTimestamp: metav1.Now(), LastTimestamp: metav1.Now(), Count: 1}, metav1.CreateOptions{})
	return err
}

func getController(ctx context.Context, client kubernetes.Interface, namespace string, owner target) (metav1.Object, error) {
	switch owner.Kind {
	case "Deployment":
		return client.AppsV1().Deployments(namespace).Get(ctx, owner.Name, metav1.GetOptions{})
	case "StatefulSet":
		return client.AppsV1().StatefulSets(namespace).Get(ctx, owner.Name, metav1.GetOptions{})
	case "DaemonSet":
		return client.AppsV1().DaemonSets(namespace).Get(ctx, owner.Name, metav1.GetOptions{})
	}
	return nil, fmt.Errorf("unsupported controller kind %s", owner.Kind)
}
func patchController(ctx context.Context, client kubernetes.Interface, namespace string, owner target, kind types.PatchType, patch []byte) error {
	var err error
	switch owner.Kind {
	case "Deployment":
		_, err = client.AppsV1().Deployments(namespace).Patch(ctx, owner.Name, kind, patch, metav1.PatchOptions{})
	case "StatefulSet":
		_, err = client.AppsV1().StatefulSets(namespace).Patch(ctx, owner.Name, kind, patch, metav1.PatchOptions{})
	case "DaemonSet":
		_, err = client.AppsV1().DaemonSets(namespace).Patch(ctx, owner.Name, kind, patch, metav1.PatchOptions{})
	}
	return err
}
