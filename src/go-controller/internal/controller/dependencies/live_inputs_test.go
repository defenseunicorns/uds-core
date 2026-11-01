// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
package dependencies

import (
	"context"
	"fmt"
	"os"
	"runtime"
	"strings"
	"sync"
	"testing"
	"time"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/tools/cache"
	"k8s.io/client-go/tools/clientcmd"
)

// Run explicitly against a disposable cluster. All writes are confined to one
// generated namespace; normal unit/CI runs do not discover a user's kubeconfig.
func TestLiveScopedInformerMemoryAndOptIn(t *testing.T) {
	path := os.Getenv("UDS_INFORMER_TEST_KUBECONFIG")
	if path == "" {
		t.Skip("requires an explicit disposable-cluster kubeconfig")
	}
	cfg, err := clientcmd.BuildConfigFromFlags("", path)
	if err != nil {
		t.Fatal(err)
	}
	cfg.QPS, cfg.Burst = 200, 200
	client, err := kubernetes.NewForConfig(cfg)
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
	defer cancel()
	ns, err := client.CoreV1().Namespaces().Create(ctx, &corev1.Namespace{ObjectMeta: metav1.ObjectMeta{GenerateName: "uds-informer-test-"}}, metav1.CreateOptions{})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		cleanup, stop := context.WithTimeout(context.Background(), 30*time.Second)
		defer stop()
		if err := client.CoreV1().Namespaces().Delete(cleanup, ns.Name, metav1.DeleteOptions{Preconditions: &metav1.Preconditions{UID: &ns.UID}}); err != nil {
			t.Error(err)
		}
	})
	inputs := NewInputs(client)
	added := make(chan bool, 4)
	inputs.ReloadConfigMaps.AddEventHandler(cache.ResourceEventHandlerDetailedFuncs{AddFunc: func(obj interface{}, initial bool) {
		cm := obj.(*corev1.ConfigMap)
		if cm.Namespace == ns.Name {
			added <- initial
		}
	}})
	boot := &corev1.ConfigMap{ObjectMeta: metav1.ObjectMeta{Name: "boot", Namespace: ns.Name, Labels: map[string]string{"uds.dev/pod-reload": "true"}}, Data: map[string]string{"config": "boot"}}
	if _, err := client.CoreV1().ConfigMaps(ns.Name).Create(ctx, boot, metav1.CreateOptions{}); err != nil {
		t.Fatal(err)
	}
	if err := inputs.Start(ctx); err != nil {
		t.Fatal(err)
	}
	select {
	case initial := <-added:
		if !initial {
			t.Fatal("initial list reported as live addition")
		}
	case <-ctx.Done():
		t.Fatal(ctx.Err())
	}
	runtime.GC()
	var before, after runtime.MemStats
	runtime.ReadMemStats(&before)
	// 3,000 unrelated objects carry about 48 MiB of payload. Caching them would
	// exceed the generous 8 MiB retained-heap allowance even before object overhead.
	payload := strings.Repeat("x", 16*1024)
	errs := make(chan error, 4)
	var workers sync.WaitGroup
	for worker := range 4 {
		workers.Add(1)
		go func() {
			defer workers.Done()
			for n := worker; n < 1500; n += 4 {
				name := fmt.Sprintf("unrelated-%04d", n)
				if _, err := client.CoreV1().Secrets(ns.Name).Create(ctx, &corev1.Secret{ObjectMeta: metav1.ObjectMeta{Name: name}, Data: map[string][]byte{"payload": []byte(payload)}}, metav1.CreateOptions{}); err != nil {
					errs <- err
					return
				}
				if _, err := client.CoreV1().ConfigMaps(ns.Name).Create(ctx, &corev1.ConfigMap{ObjectMeta: metav1.ObjectMeta{Name: name}, Data: map[string]string{"payload": payload}}, metav1.CreateOptions{}); err != nil {
					errs <- err
					return
				}
			}
		}()
	}
	workers.Wait()
	close(errs)
	for err := range errs {
		t.Fatal(err)
	}
	cm, err := client.CoreV1().ConfigMaps(ns.Name).Get(ctx, "unrelated-0000", metav1.GetOptions{})
	if err != nil {
		t.Fatal(err)
	}
	cm.Labels = map[string]string{"uds.dev/pod-reload": "true"}
	cm.Data["payload"] = "changed while opting in"
	if _, err := client.CoreV1().ConfigMaps(ns.Name).Update(ctx, cm, metav1.UpdateOptions{}); err != nil {
		t.Fatal(err)
	}
	select {
	case initial := <-added:
		if initial {
			t.Fatal("live opt-in reported as initial replay")
		}
	case <-ctx.Done():
		t.Fatal(ctx.Err())
	}
	if got := len(inputs.ReloadConfigMaps.GetStore().List()); got != 2 {
		t.Fatalf("reload cache contains %d ConfigMaps, expected 2", got)
	}
	if got := len(inputs.ReloadSecrets.GetStore().List()); got != 0 {
		t.Fatalf("reload cache contains %d unrelated Secrets", got)
	}
	for _, informer := range []cache.SharedIndexInformer{inputs.Operator, inputs.Identity, inputs.Authservice, inputs.Blackbox, inputs.Mesh, inputs.Certificates} {
		for _, obj := range informer.GetStore().List() {
			key, err := cache.MetaNamespaceKeyFunc(obj)
			if err != nil {
				t.Fatal(err)
			}
			if strings.HasPrefix(key, ns.Name+"/") {
				t.Fatalf("named input retained unrelated tenant data: %s", key)
			}
		}
	}
	runtime.GC()
	runtime.ReadMemStats(&after)
	growth := int64(after.HeapAlloc) - int64(before.HeapAlloc)
	t.Logf("retained heap before=%d after=%d growth=%d bytes; 3000 unrelated objects, ~48 MiB payload; cached reload ConfigMaps=2 Secrets=0", before.HeapAlloc, after.HeapAlloc, growth)
	if growth > 8*1024*1024 {
		t.Fatalf("unrelated configuration grew retained heap by %d bytes", growth)
	}
}
