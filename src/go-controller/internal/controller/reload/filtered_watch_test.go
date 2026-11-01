// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
package reload

import (
	"context"
	"testing"
	"time"

	corev1 "k8s.io/api/core/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/util/wait"
	"k8s.io/apimachinery/pkg/watch"
	"k8s.io/client-go/kubernetes/fake"
	"k8s.io/client-go/tools/cache"
)

func TestFilteredWatchOptInRestartsButInitialListDoesNot(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	stream := watch.NewRaceFreeFake()
	initial := &corev1.ConfigMap{ObjectMeta: metav1.ObjectMeta{Name: "initial", Namespace: "app", UID: "initial", ResourceVersion: "1", Labels: map[string]string{reloadLabel: "true"}}, Data: map[string]string{"config": "boot"}}
	maps := cache.NewSharedIndexInformer(&cache.ListWatch{
		ListFunc: func(metav1.ListOptions) (runtime.Object, error) {
			return &corev1.ConfigMapList{ListMeta: metav1.ListMeta{ResourceVersion: "1"}, Items: []corev1.ConfigMap{*initial}}, nil
		},
		WatchFunc: func(o metav1.ListOptions) (watch.Interface, error) {
			if o.SendInitialEvents != nil && *o.SendInitialEvents {
				return nil, apierrors.NewBadRequest("watch-list unsupported by fixture")
			}
			return stream, nil
		},
	}, &corev1.ConfigMap{}, 0, cache.Indexers{})
	secrets := cache.NewSharedIndexInformer(nil, &corev1.Secret{}, 0, cache.Indexers{})
	c := NewController(fake.NewClientset(), secrets, maps)
	defer c.queue.ShutDown()
	done := make(chan struct{})
	go func() { defer close(done); maps.Run(ctx.Done()) }()
	defer func() { cancel(); <-done }()
	check := func(name string, restart bool) {
		t.Helper()
		err := wait.PollUntilContextTimeout(ctx, time.Millisecond, 3*time.Second, true, func(context.Context) (bool, error) {
			c.mu.Lock()
			defer c.mu.Unlock()
			r, ok := c.pending["ConfigMap/app/"+name]
			return ok && r.Restart == restart, nil
		})
		if err != nil {
			t.Fatalf("%s restart=%v: %v", name, restart, err)
		}
	}
	check("initial", false)
	opted := initial.DeepCopy()
	opted.Name = "newly-labelled"
	opted.UID = "opted"
	opted.ResourceVersion = "2"
	opted.Data["config"] = "changed while opting in"
	// Kubernetes reports an object entering a label-filtered watch as Added.
	stream.Add(opted)
	check("newly-labelled", true)
	c.mu.Lock()
	delete(c.pending, "ConfigMap/app/newly-labelled")
	c.mu.Unlock()
	stream.Modify(opted.DeepCopy())
	// The unchanged revision does not create new work after the previous request.
	if err := wait.PollUntilContextTimeout(ctx, time.Millisecond, time.Second, true, func(context.Context) (bool, error) { return maps.LastSyncResourceVersion() == "2", nil }); err != nil {
		t.Fatal(err)
	}
	c.mu.Lock()
	_, queued := c.pending["ConfigMap/app/newly-labelled"]
	c.mu.Unlock()
	if queued {
		t.Fatal("unchanged revision restarted consumers again")
	}
}
