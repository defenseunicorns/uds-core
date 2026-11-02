// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
package reload

import (
	"context"
	"fmt"
	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/util/wait"
	"k8s.io/client-go/informers"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/tools/clientcmd"
	"k8s.io/utils/ptr"
	"os"
	"testing"
	"time"
)

func TestLiveReloadWorkloadWithoutPods(t *testing.T) {
	path := os.Getenv("UDS_RELOAD_TEST_KUBECONFIG")
	if path == "" {
		t.Skip("requires an explicit disposable-cluster kubeconfig")
	}
	cfg, err := clientcmd.BuildConfigFromFlags("", path)
	if err != nil {
		t.Fatal(err)
	}
	client, err := kubernetes.NewForConfig(cfg)
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()
	ns, err := client.CoreV1().Namespaces().Create(ctx, &corev1.Namespace{ObjectMeta: metav1.ObjectMeta{GenerateName: "uds-reload-test-"}}, metav1.CreateOptions{})
	if err != nil {
		t.Fatal(err)
	}
	defer func() {
		cleanup, stop := context.WithTimeout(context.Background(), 20*time.Second)
		defer stop()
		if err := client.CoreV1().Namespaces().Delete(cleanup, ns.Name, metav1.DeleteOptions{Preconditions: &metav1.Preconditions{UID: &ns.UID}}); err != nil {
			t.Error(err)
		}
	}()
	// Zero replicas models the Pod-free interval of a rollout without depending
	// on image pulls. The real API still validates patches and advances generation.
	dep := &appsv1.Deployment{ObjectMeta: metav1.ObjectMeta{Name: "consumer", Namespace: ns.Name}, Spec: appsv1.DeploymentSpec{Replicas: ptr.To(int32(0)), Selector: &metav1.LabelSelector{MatchLabels: map[string]string{"app": "consumer"}}, Template: corev1.PodTemplateSpec{ObjectMeta: metav1.ObjectMeta{Labels: map[string]string{"app": "consumer"}}, Spec: corev1.PodSpec{Containers: []corev1.Container{{Name: "unused", Image: "registry.invalid/unused"}}}}}}
	if _, err := client.AppsV1().Deployments(ns.Name).Create(ctx, dep, metav1.CreateOptions{}); err != nil {
		t.Fatal(err)
	}
	factory := informers.NewSharedInformerFactoryWithOptions(client, 0, informers.WithNamespace(ns.Name), informers.WithTweakListOptions(func(o *metav1.ListOptions) { o.LabelSelector = "uds.dev/pod-reload=true" }))
	c := NewController(client, factory.Core().V1().Secrets().Informer(), factory.Core().V1().ConfigMaps().Informer())
	factory.Start(ctx.Done())
	for resource, synced := range factory.WaitForCacheSync(ctx.Done()) {
		if !synced {
			t.Fatalf("informer %s did not sync", resource)
		}
	}
	done := make(chan struct{})
	go func() { defer close(done); c.Run(ctx) }()
	defer func() { cancel(); <-done }()
	for iteration := range 10 {
		current, err := client.AppsV1().Deployments(ns.Name).Get(ctx, "consumer", metav1.GetOptions{})
		if err != nil {
			t.Fatal(err)
		}
		before := current.Generation
		if iteration == 0 {
			_, err = client.CoreV1().Secrets(ns.Name).Create(ctx, &corev1.Secret{ObjectMeta: metav1.ObjectMeta{Name: "config", Labels: map[string]string{reloadLabel: "true"}, Annotations: map[string]string{selectorAnnotation: "app=consumer"}}, Data: map[string][]byte{"value": []byte("0")}}, metav1.CreateOptions{})
		} else {
			secret, e := client.CoreV1().Secrets(ns.Name).Get(ctx, "config", metav1.GetOptions{})
			if e != nil {
				t.Fatal(e)
			}
			secret.Data["value"] = []byte(fmt.Sprint(iteration))
			_, err = client.CoreV1().Secrets(ns.Name).Update(ctx, secret, metav1.UpdateOptions{})
		}
		if err != nil {
			t.Fatal(err)
		}
		if err := wait.PollUntilContextTimeout(ctx, 20*time.Millisecond, 5*time.Second, true, func(context.Context) (bool, error) {
			d, err := client.AppsV1().Deployments(ns.Name).Get(ctx, "consumer", metav1.GetOptions{})
			return err == nil && d.Generation > before, err
		}); err != nil {
			t.Fatalf("reload %d lost without Pods: %v", iteration, err)
		}
	}
	events, err := client.CoreV1().Events(ns.Name).List(ctx, metav1.ListOptions{})
	if err != nil {
		t.Fatal(err)
	}
	count := 0
	for _, event := range events.Items {
		if event.Reason == "SecretChanged" {
			count++
		}
	}
	if count != 10 {
		t.Fatalf("got %d restart Events, want 10", count)
	}
	t.Log("10 real Secret changes advanced Deployment generation and emitted Events with no Pods present")
}
