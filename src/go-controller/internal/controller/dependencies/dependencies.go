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
	"k8s.io/client-go/informers"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/tools/cache"
	"k8s.io/client-go/util/workqueue"
	"log/slog"
	"reflect"
	"sigs.k8s.io/yaml"
	"slices"
	"strings"
	"time"
)

type Controller struct {
	client   kubernetes.Interface
	packages packageQueue
	factory  informers.SharedInformerFactory
	queue    workqueue.TypedRateLimitingInterface[string]
}

type packageQueue interface {
	RequeueAll()
	Resync()
	RequeueNamespace(string)
	RequeueName(string, string)
	RequeueSSOClients([]string)
	RequeueUIDs([]types.UID)
}

func New(client kubernetes.Interface, factory informers.SharedInformerFactory, packages packageQueue) *Controller {
	c := &Controller{client: client, factory: factory, packages: packages, queue: workqueue.NewTypedRateLimitingQueue(workqueue.DefaultTypedControllerRateLimiter[string]())}
	c.watchNamespaceLifecycle(factory.Core().V1().Namespaces().Informer())
	c.watchSharedSecrets(factory.Core().V1().Secrets().Informer())
	for _, informer := range []cache.SharedIndexInformer{factory.Core().V1().Nodes().Informer(), factory.Discovery().V1().EndpointSlices().Informer(), factory.Core().V1().Services().Informer(), factory.Core().V1().Secrets().Informer(), factory.Core().V1().ConfigMaps().Informer()} {
		informer.AddEventHandler(cache.ResourceEventHandlerFuncs{AddFunc: c.changed, UpdateFunc: func(old, obj interface{}) {
			if relevantChange(old, obj) {
				c.ownedChanged(old)
				c.changed(obj)
			}
		}, DeleteFunc: c.changed})
	}
	factory.Core().V1().Pods().Informer().AddEventHandler(cache.ResourceEventHandlerFuncs{AddFunc: c.workloadChanged, UpdateFunc: func(old, obj interface{}) {
		if relevantChange(old, obj) {
			c.workloadChanged(obj)
		}
	}, DeleteFunc: c.workloadChanged})
	factory.Networking().V1().NetworkPolicies().Informer().AddEventHandler(c.OwnedHandlers())
	return c
}

func (c *Controller) ConfigChanged() { c.queue.Add("config"); c.packages.RequeueAll() }

func (c *Controller) changed(obj interface{}) {
	if tombstone, ok := obj.(cache.DeletedFinalStateUnknown); ok {
		obj = tombstone.Obj
	}
	// Informer stores already contain the new snapshot, including deletions.
	c.Refresh()
	if resource, ok := obj.(*corev1.ConfigMap); ok && resource.Namespace == "istio-system" && resource.Name == "istio" {
		c.queue.Add("gateway")
	}
	if resource, ok := obj.(*corev1.Secret); ok && resource.Namespace == "keycloak" && resource.Name == "keycloak-client-secrets" {
		sso.InvalidateToken()
		c.packages.RequeueAll()
	}
	switch obj.(type) {
	case *corev1.Pod, *corev1.Service:
		c.workloadChanged(obj)
	}
	c.ownedChanged(obj)
}

func (c *Controller) workloadChanged(obj interface{}) {
	if tombstone, ok := obj.(cache.DeletedFinalStateUnknown); ok {
		obj = tombstone.Obj
	}
	accessor, err := meta.Accessor(obj)
	if err != nil {
		return
	}
	c.packages.RequeueNamespace(accessor.GetNamespace())
}

// Refresh computes discoveries from complete informer snapshots. Overrides are
// kept separate so removing an override immediately restores discovery.
func (c *Controller) Refresh() {
	prior := config.Get()
	nodes := c.factory.Core().V1().Nodes().Informer().GetStore().List()
	slices := c.factory.Discovery().V1().EndpointSlices().Informer().GetStore().List()
	service, _, _ := c.factory.Core().V1().Services().Informer().GetStore().GetByKey("default/kubernetes")
	operator, _, _ := c.factory.Core().V1().Secrets().Informer().GetStore().GetByKey("pepr-system/uds-operator-config")
	certs, _, _ := c.factory.Core().V1().ConfigMaps().Informer().GetStore().GetByKey("pepr-system/uds-ca-certs")
	config.Update(func(cfg *config.Config) {
		cfg.DiscoveredNodeCIDRs = NodeCIDRs(nodes)
		cfg.DiscoveredAPICIDRs = EndpointCIDRs(slices)
		cfg.APIServiceCIDRs = ServiceCIDRs(service)
		LoadOperatorSecret(cfg, operator)
		cfg.CABundle.DoDCerts = ""
		cfg.CABundle.PublicCerts = ""
		if cm, ok := certs.(*corev1.ConfigMap); ok {
			cfg.CABundle.DoDCerts = cm.Data["dodCACerts"]
			cfg.CABundle.PublicCerts = cm.Data["publicCACerts"]
		}
	})
	next := config.Get()
	if prior.KeycloakClientMode != next.KeycloakClientMode {
		sso.InvalidateToken()
	}
	if !reflect.DeepEqual(prior, next) {
		c.ConfigChanged()
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
	pkg := accessor.GetLabels()["uds/package"]
	if strings.HasPrefix(pkg, "shared-") {
		c.packages.RequeueAll()
		return
	}
	targets := []string{}
	if pkg != "" {
		targets = append(targets, pkg)
	}
	for _, owner := range accessor.GetOwnerReferences() {
		if owner.APIVersion == "uds.dev/v1alpha1" && owner.Kind == "Package" && owner.Name != "" {
			targets = append(targets, owner.Name)
		}
	}
	slices.Sort(targets)
	for _, target := range slices.Compact(targets) {
		c.packages.RequeueName(accessor.GetNamespace(), target)
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
		return !ok || !reflect.DeepEqual(prior.Status.Addresses, next.Status.Addresses)
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
