// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

// Package dependencies watches inputs used by Package reconciliation and keeps
// replica-local admission config current. Cluster writes run under the Lease.
package dependencies

import (
	"context"
	"encoding/json"
	"fmt"
	"github.com/defenseunicorns/uds-core/src/go-controller/internal/config"
	"github.com/defenseunicorns/uds-core/src/go-controller/internal/controller/cabundle"
	"github.com/defenseunicorns/uds-core/src/go-controller/internal/controller/reload"
	"github.com/defenseunicorns/uds-core/src/go-controller/internal/controller/sso"
	corev1 "k8s.io/api/core/v1"
	discoveryv1 "k8s.io/api/discovery/v1"
	networkingv1 "k8s.io/api/networking/v1"
	"k8s.io/apimachinery/pkg/api/meta"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/tools/cache"
	"k8s.io/client-go/util/workqueue"
	"log/slog"
	"reflect"
	"sigs.k8s.io/yaml"
	"sync"
	"time"
)

type Controller struct {
	client        kubernetes.Interface
	packages      packageQueue
	inputs        *Inputs
	queue         workqueue.TypedRateLimitingInterface[string]
	discoveryWake chan struct{}
	discoveryMu   sync.Mutex
	dirty         map[string]bool
}

type packageQueue interface {
	RequeueAll()
	Resync()
	RequeueNamespace(string)
	RequeueOwned(string, string, types.UID)
	RequeueSSOClients([]string)
	RequeueUIDs([]types.UID)
}

func New(client kubernetes.Interface, inputs *Inputs, packages packageQueue) *Controller {
	c := &Controller{client: client, inputs: inputs, packages: packages, queue: workqueue.NewTypedRateLimitingQueue(workqueue.DefaultTypedControllerRateLimiter[string]()), discoveryWake: make(chan struct{}, 1), dirty: map[string]bool{}}
	c.watchNamespaceLifecycle(inputs.Namespaces)
	c.watchSharedSecrets(inputs.Authservice)
	c.watchSharedSecrets(inputs.Blackbox)
	for _, informer := range []cache.SharedIndexInformer{inputs.Nodes, inputs.Endpoints, inputs.APIService, inputs.APITunnels, inputs.Operator, inputs.Identity, inputs.Mesh, inputs.Certificates} {
		informer.AddEventHandler(cache.ResourceEventHandlerDetailedFuncs{AddFunc: func(obj interface{}, initial bool) {
			if !initial {
				c.changed(obj)
			}
		}, UpdateFunc: func(old, obj interface{}) {
			if relevantChange(old, obj) {
				c.changed(obj)
			}
		}, DeleteFunc: c.changed})
	}
	inputs.NetworkPolicies.AddEventHandler(c.OwnedHandlers())
	return c
}

func (c *Controller) ConfigChanged() {
	c.queue.Add("config")
	if c.packages != nil {
		c.packages.RequeueAll()
	}
}

func (c *Controller) changed(obj interface{}) {
	if tombstone, ok := obj.(cache.DeletedFinalStateUnknown); ok {
		obj = tombstone.Obj
	}
	// Informer stores already contain the new snapshot, including deletions.
	if key := discoveryInput(obj); key != "" {
		c.discoveryMu.Lock()
		c.dirty[key] = true
		c.discoveryMu.Unlock()
		select {
		case c.discoveryWake <- struct{}{}:
		default:
		}
	}
	if resource, ok := obj.(*corev1.ConfigMap); ok && resource.Namespace == "istio-system" && resource.Name == "istio" {
		c.queue.Add("gateway")
	}
	if resource, ok := obj.(*corev1.Secret); ok && resource.Namespace == "keycloak" && resource.Name == "keycloak-client-secrets" {
		sso.InvalidateToken()
		c.packages.RequeueAll()
	}
}

func (c *Controller) OwnedHandlers() cache.ResourceEventHandlerFuncs {
	return cache.ResourceEventHandlerFuncs{AddFunc: c.ownedChanged, DeleteFunc: c.ownedChanged, UpdateFunc: func(old, obj interface{}) {
		if relevantChange(old, obj) {
			// A removed/reassigned label or owner must still repair the previous
			// Package. The queue coalesces old and new targets with the same key.
			c.ownedChanged(old)
			c.ownedChanged(obj)
		}
	}}
}
func (c *Controller) ownedChanged(obj interface{}) {
	if tombstone, ok := obj.(cache.DeletedFinalStateUnknown); ok {
		obj = tombstone.Obj
	}
	accessor, err := meta.Accessor(obj)
	if err != nil {
		return
	}
	if c.packages == nil {
		return
	}
	if sharedResource(obj) {
		c.packages.RequeueAll()
		return
	}
	// Discovery labels alone cannot invalidate another Package's recovery cache.
	for _, owner := range accessor.GetOwnerReferences() {
		if owner.APIVersion == "uds.dev/v1alpha1" && owner.Kind == "Package" && owner.Name != "" && owner.UID != "" {
			c.packages.RequeueOwned(accessor.GetNamespace(), owner.Name, owner.UID)
		}
	}
}

func relevantChange(old, obj interface{}) bool {
	before, err := meta.Accessor(old)
	if err != nil {
		return true
	}
	after, err := meta.Accessor(obj)
	if err != nil {
		return true
	}
	if before.GetUID() != after.GetUID() || !reflect.DeepEqual(before.GetLabels(), after.GetLabels()) || !reflect.DeepEqual(before.GetAnnotations(), after.GetAnnotations()) || !reflect.DeepEqual(before.GetOwnerReferences(), after.GetOwnerReferences()) || !reflect.DeepEqual(before.GetFinalizers(), after.GetFinalizers()) || !reflect.DeepEqual(before.GetDeletionTimestamp(), after.GetDeletionTimestamp()) {
		return true
	}
	if before.GetResourceVersion() == after.GetResourceVersion() {
		return false
	}
	switch next := obj.(type) {
	case *corev1.Pod:
		prior, ok := old.(*corev1.Pod)
		if !ok {
			return true
		}
		if next.Namespace == config.APITunnelNamespace {
			return prior.Status.PodIP != next.Status.PodIP || !reflect.DeepEqual(prior.Status.PodIPs, next.Status.PodIPs) || prior.Status.Phase != next.Status.Phase
		}
		return !ok || !reflect.DeepEqual(prior.Spec, next.Spec)
	case *corev1.ConfigMap:
		prior, ok := old.(*corev1.ConfigMap)
		return !ok || !reflect.DeepEqual(prior.Data, next.Data) || !reflect.DeepEqual(prior.BinaryData, next.BinaryData)
	case *corev1.Secret:
		prior, ok := old.(*corev1.Secret)
		return !ok || !reflect.DeepEqual(prior.Data, next.Data)
	case *corev1.Service:
		prior, ok := old.(*corev1.Service)
		return !ok || !reflect.DeepEqual(prior.Spec, next.Spec)
	case *corev1.Node:
		prior, ok := old.(*corev1.Node)
		return !ok || !reflect.DeepEqual(prior.Status.Addresses, next.Status.Addresses) || prior.Spec.PodCIDR != next.Spec.PodCIDR || !reflect.DeepEqual(prior.Spec.PodCIDRs, next.Spec.PodCIDRs)
	case *discoveryv1.EndpointSlice:
		prior, ok := old.(*discoveryv1.EndpointSlice)
		return !ok || !reflect.DeepEqual(prior.Endpoints, next.Endpoints)
	case *networkingv1.NetworkPolicy:
		prior, ok := old.(*networkingv1.NetworkPolicy)
		return !ok || !reflect.DeepEqual(prior.Spec, next.Spec)
	case *unstructured.Unstructured:
		prior, ok := old.(*unstructured.Unstructured)
		return !ok || !reflect.DeepEqual(prior.Object["spec"], next.Object["spec"])
	}
	// Core Node/EndpointSlice status carries address discovery. Other typed inputs
	// are inexpensive to refresh and do not enqueue Packages when unchanged.
	return true
}

func (c *Controller) Run(ctx context.Context) {
	defer c.queue.ShutDown()
	c.queue.Add("config")
	done := make(chan struct{})
	go func() {
		defer close(done)
		for c.processNext(ctx) {
		}
	}()
	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			c.queue.ShutDown()
			<-done
			return
		case <-ticker.C:
			c.packages.Resync()
		}
	}
}
func (c *Controller) processNext(ctx context.Context) bool {
	key, shutdown := c.queue.Get()
	if shutdown {
		return false
	}
	defer c.queue.Done(key)
	var err error
	if key == "gateway" {
		err = c.reloadGateways(ctx)
	} else {
		err = cabundle.EnsureIstioTrustBundle(ctx, c.client.CoreV1())
		if err == nil {
			err = sso.UpdateGlobalConfig(ctx, c.client)
		}
	}
	if err != nil {
		slog.Error("dependency reconciliation failed", "input", key, "error", err)
		if ctx.Err() == nil {
			c.queue.AddRateLimited(key)
		}
	} else {
		c.queue.Forget(key)
	}
	return true
}

func (c *Controller) reloadGateways(ctx context.Context) error {
	cm, err := c.client.CoreV1().ConfigMaps("istio-system").Get(ctx, "istio", metav1.GetOptions{})
	if err != nil {
		return err
	}
	var mesh map[string]interface{}
	if err := yaml.Unmarshal([]byte(cm.Data["mesh"]), &mesh); err != nil {
		return err
	}
	defaultConfig, _ := mesh["defaultConfig"].(map[string]interface{})
	topology, _ := defaultConfig["gatewayTopology"].(map[string]interface{})
	selected := map[string]interface{}{}
	for _, key := range []string{"numTrustedProxies", "forwardClientCertDetails", "proxyProtocol"} {
		if value, ok := topology[key]; ok {
			selected[key] = value
		}
	}
	token, _ := json.Marshal(selected)
	for _, ns := range []string{"istio-tenant-gateway", "istio-admin-gateway"} {
		pods, err := c.client.CoreV1().Pods(ns).List(ctx, metav1.ListOptions{})
		if err != nil {
			return err
		}
		if err := reload.ReloadPods(ctx, c.client, ns, pods.Items, "Istio gateway topology change", "ConfigMapChanged", fmt.Sprintf("ConfigMap/istio/%s/%s", cm.UID, token)); err != nil {
			return err
		}
	}
	return nil
}
