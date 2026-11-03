// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
package reload

import (
	"context"
	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/client-go/kubernetes/fake"
	ktesting "k8s.io/client-go/testing"
	"k8s.io/client-go/tools/cache"
	"k8s.io/utils/ptr"
	"testing"
)

func TestSecondSecretChangeDuringRolloutStillRestartsController(t *testing.T) {
	for _, gap := range []string{"terminating-pod", "no-pods"} {
		t.Run(gap, func(t *testing.T) {
			ctx := context.Background()
			secret := &corev1.Secret{ObjectMeta: metav1.ObjectMeta{Name: "config", Namespace: "app", UID: "secret", Labels: map[string]string{reloadLabel: "true"}, Annotations: map[string]string{selectorAnnotation: "app=consumer"}}, Data: map[string][]byte{"value": []byte("initial")}}
			dep := &appsv1.Deployment{ObjectMeta: metav1.ObjectMeta{Name: "consumer", Namespace: "app", UID: "deployment"}, Spec: appsv1.DeploymentSpec{Template: corev1.PodTemplateSpec{ObjectMeta: metav1.ObjectMeta{Labels: map[string]string{"app": "consumer"}}}}}
			pod := &corev1.Pod{ObjectMeta: metav1.ObjectMeta{Name: "old", Namespace: "app", UID: "pod", Labels: map[string]string{"app": "consumer"}, OwnerReferences: []metav1.OwnerReference{{Kind: "Deployment", Name: "consumer", UID: "deployment", Controller: ptr.To(true)}}}}
			client := fake.NewClientset(secret, dep, pod)
			events := 0
			client.PrependReactor("create", "events", func(a ktesting.Action) (bool, runtime.Object, error) {
				events++
				return true, a.(ktesting.CreateAction).GetObject(), nil
			})
			c := NewController(client, cache.NewSharedIndexInformer(nil, &corev1.Secret{}, 0, cache.Indexers{}), cache.NewSharedIndexInformer(nil, &corev1.ConfigMap{}, 0, cache.Indexers{}))
			defer c.queue.ShutDown()
			c.add(secret, false)
			c.processNext(ctx)
			if events != 1 {
				t.Fatal("initial live addition did not restart consumer")
			}
			first, _ := client.AppsV1().Deployments("app").Get(ctx, "consumer", metav1.GetOptions{})
			if gap == "no-pods" {
				client.CoreV1().Pods("app").Delete(ctx, "old", metav1.DeleteOptions{})
			} else {
				now := metav1.Now()
				pod.DeletionTimestamp = &now
				client.CoreV1().Pods("app").Update(ctx, pod, metav1.UpdateOptions{})
			}
			next := secret.DeepCopy()
			next.Data["value"] = []byte("second")
			if _, err := client.CoreV1().Secrets("app").Update(ctx, next, metav1.UpdateOptions{}); err != nil {
				t.Fatal(err)
			}
			c.observe(secret, next)
			c.processNext(ctx)
			second, _ := client.AppsV1().Deployments("app").Get(ctx, "consumer", metav1.GetOptions{})
			if events != 2 || first.Spec.Template.Annotations["uds.dev/restartedAt"] == second.Spec.Template.Annotations["uds.dev/restartedAt"] {
				t.Fatal("second content change was lost during rollout")
			}
			c.observe(next, next.DeepCopy())
			if c.queue.Len() != 0 {
				t.Fatal("unchanged content repeated restart")
			}
		})
	}
}
