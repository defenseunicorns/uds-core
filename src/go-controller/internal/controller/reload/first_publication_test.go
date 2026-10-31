// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package reload

import (
	"context"
	"testing"

	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes/fake"
	"k8s.io/client-go/tools/cache"
	"k8s.io/utils/ptr"
)

func TestReloadFirstOptInPublicationReachesExistingConsumers(t *testing.T) {
	for _, test := range []struct {
		name       string
		oldPresent bool
		oldEnabled bool
		dataChange bool
		restart    bool
	}{
		{"first labelled content publication", true, false, true, true},
		{"existing labelled content publication", true, true, true, true},
		{"metadata-only opt in", true, false, false, false},
		{"initial informer listing", false, false, false, false},
	} {
		t.Run(test.name, func(t *testing.T) {
			current := &corev1.ConfigMap{ObjectMeta: metav1.ObjectMeta{Name: "trust", Namespace: "test", UID: "config", Labels: map[string]string{reloadLabel: "true"}}, Data: map[string]string{"extra.pem": "published-root"}}
			var old interface{}
			if test.oldPresent {
				prior := current.DeepCopy()
				if !test.oldEnabled {
					prior.Labels = nil
				}
				if test.dataChange {
					prior.Data["extra.pem"] = ""
				}
				old = prior
			}
			deployment := &appsv1.Deployment{ObjectMeta: metav1.ObjectMeta{Name: "app", Namespace: "test", UID: "deployment"}}
			rs := &appsv1.ReplicaSet{ObjectMeta: metav1.ObjectMeta{Name: "app-rs", Namespace: "test", UID: "rs", OwnerReferences: []metav1.OwnerReference{{Kind: "Deployment", Name: "app", UID: "deployment", Controller: ptr.To(true)}}}}
			pod := &corev1.Pod{ObjectMeta: metav1.ObjectMeta{Name: "app-pod", Namespace: "test", UID: "pod", OwnerReferences: []metav1.OwnerReference{{Kind: "ReplicaSet", Name: "app-rs", UID: "rs", Controller: ptr.To(true)}}}, Spec: corev1.PodSpec{Volumes: []corev1.Volume{{Name: "trust", VolumeSource: corev1.VolumeSource{ConfigMap: &corev1.ConfigMapVolumeSource{LocalObjectReference: corev1.LocalObjectReference{Name: "trust"}}}}}}}
			client := fake.NewClientset(current, deployment, rs, pod)
			secrets := cache.NewSharedIndexInformer(nil, &corev1.Secret{}, 0, cache.Indexers{})
			configMaps := cache.NewSharedIndexInformer(nil, &corev1.ConfigMap{}, 0, cache.Indexers{})
			controller := NewController(client, secrets, configMaps)
			t.Cleanup(controller.queue.ShutDown)
			controller.observe(old, current)
			if controller.queue.Len() > 0 {
				controller.processNext(context.Background())
			}
			got, err := client.AppsV1().Deployments("test").Get(context.Background(), "app", metav1.GetOptions{})
			if err != nil {
				t.Fatal(err)
			}
			if (got.Spec.Template.Annotations["uds.dev/restartedAt"] != "") != test.restart {
				t.Fatalf("consumer restart=%v, expected=%v", got.Spec.Template.Annotations, test.restart)
			}
			controller.observe(current, current.DeepCopy())
			if controller.queue.Len() != 0 {
				t.Fatal("unchanged revision queued another consumer restart")
			}
		})
	}
}
