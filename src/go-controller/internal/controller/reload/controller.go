// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

// Package reload watches opt-in configuration data and performs recoverable,
// controller-based rolling restarts without taking ownership of workload specs.
package reload

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	corev1 "k8s.io/api/core/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/tools/cache"
	"k8s.io/client-go/util/workqueue"
	"log/slog"
	"reflect"
	"sync"
)

const reloadLabel = "uds.dev/pod-reload"
const selectorAnnotation = "uds.dev/pod-reload-selector"
const cleanupAnnotation = "uds.dev/pod-reload-cleanup-complete"

type request struct {
	Kind, Namespace, Name string
	UID                   string
	Token                 string
	Selector              string
	Restart               bool
	CleanupComplete       bool
	Epoch                 uint64
}

type Controller struct {
	client  kubernetes.Interface
	queue   workqueue.TypedRateLimitingInterface[string]
	synced  []cache.InformerSynced
	mu      sync.Mutex
	pending map[string]request
}

func NewController(client kubernetes.Interface, secrets, configMaps cache.SharedIndexInformer) *Controller {
	c := &Controller{client: client, queue: workqueue.NewTypedRateLimitingQueue(workqueue.DefaultTypedControllerRateLimiter[string]()), pending: map[string]request{}, synced: []cache.InformerSynced{secrets.HasSynced, configMaps.HasSynced}}
	for _, informer := range []cache.SharedIndexInformer{secrets, configMaps} {
		informer.AddEventHandler(cache.ResourceEventHandlerFuncs{AddFunc: func(obj interface{}) { c.observe(nil, obj) }, UpdateFunc: c.observe, DeleteFunc: c.remove})
	}
	return c
}

func dataRequest(obj interface{}) (request, bool) {
	var meta metav1.Object
	var data interface{}
	kind := ""
	switch resource := obj.(type) {
	case *corev1.Secret:
		meta = resource
		data = resource.Data
		kind = "Secret"
	case *corev1.ConfigMap:
		meta = resource
		data = struct {
			Data   map[string]string
			Binary map[string][]byte
		}{resource.Data, resource.BinaryData}
		kind = "ConfigMap"
	default:
		return request{}, false
	}
	encoded, _ := json.Marshal(data) // encoding/json sorts map keys.
	return request{Kind: kind, Namespace: meta.GetNamespace(), Name: meta.GetName(), UID: string(meta.GetUID()), Token: fmt.Sprintf("%x", sha256.Sum256(encoded)), Selector: meta.GetAnnotations()[selectorAnnotation], CleanupComplete: meta.GetAnnotations()[cleanupAnnotation] == "true"}, meta.GetLabels()[reloadLabel] == "true"
}

func (c *Controller) observe(old, obj interface{}) {
	cur, enabled := dataRequest(obj)
	if !enabled {
		return
	}
	prior, _ := dataRequest(old)
	// First publication may opt in while replacing bootstrap data. Existing
	// consumers must reload that change even if the old object was unlabelled.
	changed := old != nil && prior.UID == cur.UID && prior.Token != cur.Token
	if old != nil && !changed && prior.Selector == cur.Selector {
		return
	}
	key := cur.Kind + "/" + cur.Namespace + "/" + cur.Name
	c.mu.Lock()
	prev := c.pending[key]
	cur.Restart = changed || (prev.Restart && prev.UID == cur.UID)
	cur.Epoch = prev.Epoch + 1
	c.pending[key] = cur
	c.mu.Unlock()
	c.queue.Add(key)
}

func (c *Controller) remove(obj interface{}) {
	if tombstone, ok := obj.(cache.DeletedFinalStateUnknown); ok {
		obj = tombstone.Obj
	}
	cur, _ := dataRequest(obj)
	c.mu.Lock()
	delete(c.pending, cur.Kind+"/"+cur.Namespace+"/"+cur.Name)
	c.mu.Unlock()
}

func (c *Controller) Run(ctx context.Context) {
	defer c.queue.ShutDown()
	if !cache.WaitForCacheSync(ctx.Done(), c.synced...) {
		return
	}
	done := make(chan struct{})
	go func() {
		defer close(done)
		for c.processNext(ctx) {
		}
	}()
	<-ctx.Done()
	c.queue.ShutDown()
	<-done
}

func (c *Controller) processNext(ctx context.Context) bool {
	key, shutdown := c.queue.Get()
	if shutdown {
		return false
	}
	defer c.queue.Done(key)
	c.mu.Lock()
	cur, exists := c.pending[key]
	c.mu.Unlock()
	if !exists {
		c.queue.Forget(key)
		return true
	}
	if err := c.sync(ctx, cur); err != nil {
		slog.Error("pod reload failed", "resource", key, "error", err)
		if ctx.Err() == nil {
			c.queue.AddRateLimited(key)
		}
		return true
	}
	c.mu.Lock()
	if c.pending[key].Epoch == cur.Epoch {
		delete(c.pending, key)
	}
	c.mu.Unlock()
	c.queue.Forget(key)
	return true
}

func (c *Controller) sync(ctx context.Context, cur request) error {
	var resource interface{}
	var err error
	if cur.Kind == "Secret" {
		resource, err = c.client.CoreV1().Secrets(cur.Namespace).Get(ctx, cur.Name, metav1.GetOptions{})
	} else {
		resource, err = c.client.CoreV1().ConfigMaps(cur.Namespace).Get(ctx, cur.Name, metav1.GetOptions{})
	}
	if apierrors.IsNotFound(err) {
		return nil
	}
	if err != nil {
		return err
	}
	current, enabled := dataRequest(resource)
	if !enabled || current.UID != cur.UID {
		return nil
	}
	cur.Token = current.Token
	cur.Selector = current.Selector
	if !cur.Restart && current.CleanupComplete {
		return nil
	}

	pods, err := c.client.CoreV1().Pods(cur.Namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return err
	}
	var selected []corev1.Pod
	var selector map[string]string
	if cur.Restart && cur.Selector != "" {
		selector, err = ParseSelector(cur.Selector)
		if err != nil {
			return err
		}
	}
	for _, pod := range pods.Items {
		if (len(selector) > 0 && labelsMatch(pod.Labels, selector)) || (len(selector) == 0 && References(pod.Spec, cur.Kind, cur.Name)) {
			selected = append(selected, pod)
		}
	}
	if !cur.Restart {
		if err := CleanupControllerFields(ctx, c.client, cur.Namespace, selected); err != nil {
			return err
		}
		patch, _ := json.Marshal(map[string]interface{}{"metadata": map[string]interface{}{"uid": cur.UID, "annotations": map[string]string{cleanupAnnotation: "true"}}})
		if cur.Kind == "Secret" {
			_, err = c.client.CoreV1().Secrets(cur.Namespace).Patch(ctx, cur.Name, types.MergePatchType, patch, metav1.PatchOptions{})
		} else {
			_, err = c.client.CoreV1().ConfigMaps(cur.Namespace).Patch(ctx, cur.Name, types.MergePatchType, patch, metav1.PatchOptions{})
		}
		return err
	}
	return ReloadPods(ctx, c.client, cur.Namespace, selected, cur.Kind+" "+cur.Name+" change", cur.Kind+"Changed", cur.Kind+"/"+cur.Name+"/"+cur.UID+"/"+cur.Token)
}

// GatewayTopologyChanged ignores unrelated mesh edits.
func GatewayTopologyChanged(old, cur map[string]interface{}) bool {
	keys := []string{"numTrustedProxies", "forwardClientCertDetails", "proxyProtocol"}
	for _, key := range keys {
		if !reflect.DeepEqual(old[key], cur[key]) {
			return true
		}
	}
	return false
}
