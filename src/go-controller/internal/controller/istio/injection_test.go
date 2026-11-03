// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
package istio

import (
	"context"
	"errors"
	udstypes "github.com/defenseunicorns/uds-core/src/go-controller/api/uds/v1alpha1"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/client-go/kubernetes/fake"
	ktesting "k8s.io/client-go/testing"
	"k8s.io/utils/ptr"
	"testing"
)

func TestMeshLabelsAndCleanupRecoverAfterPodDeleteFailure(t *testing.T) {
	ctx := context.Background()
	ns := &corev1.Namespace{ObjectMeta: metav1.ObjectMeta{Name: "apps", Labels: map[string]string{ambientLabel: "ambient", "app-owner": "helm"}}}
	client := fake.NewClientset(ns)
	pkg := &udstypes.UDSPackage{ObjectMeta: metav1.ObjectMeta{Name: "app", Namespace: "apps"}, Spec: udstypes.Spec{Network: &udstypes.Network{ServiceMesh: &udstypes.ServiceMesh{Mode: ptr.To(udstypes.Sidecar)}}}}
	if err := EnableIstio(ctx, client.CoreV1(), pkg); err != nil {
		t.Fatal(err)
	}
	current, _ := client.CoreV1().Namespaces().Get(ctx, "apps", metav1.GetOptions{})
	if current.Labels[ambientLabel] != "" || current.Labels[injectionLabel] != "enabled" || current.Labels["app-owner"] != "helm" {
		t.Fatalf("mesh patch did not remove old label: %#v", current.Labels)
	}
	_, err := client.CoreV1().Pods("apps").Create(ctx, &corev1.Pod{ObjectMeta: metav1.ObjectMeta{Name: "sidecar", Namespace: "apps", UID: "pod"}, Spec: corev1.PodSpec{InitContainers: []corev1.Container{{Name: "istio-proxy"}}}}, metav1.CreateOptions{})
	if err != nil {
		t.Fatal(err)
	}
	fail := true
	client.PrependReactor("delete", "pods", func(ktesting.Action) (bool, runtime.Object, error) {
		if fail {
			return true, nil, errors.New("temporary delete rejection")
		}
		return false, nil, nil
	})
	if err := CleanupNamespace(ctx, client.CoreV1(), pkg); err == nil {
		t.Fatal("pod cycle error hidden")
	}
	pending, _ := client.CoreV1().Namespaces().Get(ctx, "apps", metav1.GetOptions{})
	if pending.Annotations[restartPendingAnnotation] != "ambient" {
		t.Fatal("restart intent not durable")
	}
	fail = false
	if err := CleanupNamespace(ctx, client.CoreV1(), pkg); err != nil {
		t.Fatal(err)
	}
	current, _ = client.CoreV1().Namespaces().Get(ctx, "apps", metav1.GetOptions{})
	if current.Labels[ambientLabel] != "ambient" || current.Labels[injectionLabel] != "" || current.Annotations["uds.dev/pkg-app"] != "" || current.Annotations[restartPendingAnnotation] != "" {
		t.Fatalf("cleanup did not finish: %#v", current)
	}
	pods, _ := client.CoreV1().Pods("apps").List(ctx, metav1.ListOptions{})
	if len(pods.Items) != 0 {
		t.Fatal("native sidecar pod survived cycle")
	}
}
func TestRemovingOnePackagePreservesNamespaceUsedByAnother(t *testing.T) {
	ctx := context.Background()
	ns := &corev1.Namespace{ObjectMeta: metav1.ObjectMeta{Name: "apps", Labels: map[string]string{ambientLabel: "ambient"}, Annotations: map[string]string{originalStateAnnotation: "none", "uds.dev/pkg-a": "ambient", "uds.dev/pkg-b": "ambient"}}}
	client := fake.NewClientset(ns)
	if err := CleanupNamespace(ctx, client.CoreV1(), &udstypes.UDSPackage{ObjectMeta: metav1.ObjectMeta{Name: "a", Namespace: "apps"}}); err != nil {
		t.Fatal(err)
	}
	current, _ := client.CoreV1().Namespaces().Get(ctx, "apps", metav1.GetOptions{})
	if current.Annotations["uds.dev/pkg-a"] != "" || current.Annotations["uds.dev/pkg-b"] != "ambient" || current.Labels[ambientLabel] != "ambient" {
		t.Fatalf("second Package namespace state lost: %#v", current)
	}
}
