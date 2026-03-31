// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package clusterconfig

import (
	"context"
	"log/slog"
	"sync"
	"time"

	utilruntime "k8s.io/apimachinery/pkg/util/runtime"
	"k8s.io/apimachinery/pkg/util/wait"
	"k8s.io/client-go/tools/cache"
	"k8s.io/client-go/util/workqueue"
	"k8s.io/utils/ptr"

	udsv1alpha1 "github.com/defenseunicorns/uds-core/src/go-controller/api/uds/v1alpha1"
	udsv1alpha1client "github.com/defenseunicorns/uds-core/src/go-controller/client/clientset/versioned/typed/uds/v1alpha1"
	udsv1alpha1informer "github.com/defenseunicorns/uds-core/src/go-controller/client/informers/externalversions/uds/v1alpha1"
	udsv1alpha1lister "github.com/defenseunicorns/uds-core/src/go-controller/client/listers/uds/v1alpha1"
	udscfg "github.com/defenseunicorns/uds-core/src/go-controller/internal/config"
)

// ClusterConfigController handles reconciliation of the UDS ClusterConfig resource.
// It populates the in-memory config used by other controllers (e.g. PackageController).
type ClusterConfigController struct {
	queue workqueue.TypedRateLimitingInterface[string]

	logger *slog.Logger

	udsClient                 udsv1alpha1client.UdsV1alpha1Interface
	clusterConfigLister       udsv1alpha1lister.ClusterConfigLister
	clusterConfigListerSynced cache.InformerSynced
}

// NewClusterConfigController creates a new ClusterConfigController.
func NewClusterConfigController(udsClient udsv1alpha1client.UdsV1alpha1Interface,
	clusterConfigInformer udsv1alpha1informer.ClusterConfigInformer) *ClusterConfigController {
	ctrl := &ClusterConfigController{
		queue: workqueue.NewTypedRateLimitingQueueWithConfig(
			workqueue.DefaultTypedControllerRateLimiter[string](),
			workqueue.TypedRateLimitingQueueConfig[string]{Name: "clusterconfig"},
		),
		logger: slog.Default(),

		udsClient: udsClient,
	}

	clusterConfigInformer.Informer().AddEventHandler(cache.ResourceEventHandlerFuncs{
		AddFunc: func(obj interface{}) {
			ctrl.addClusterConfig(obj)
		},
		UpdateFunc: func(oldObj, newObj interface{}) {
			ctrl.updateClusterConfig(oldObj, newObj)
		},
		// HandleDelete is intentionally omitted — ClusterConfig deletion is not expected or handled.
		// This matches Pepr's startConfigWatch, which only handles Added and Modified phases.
	})
	ctrl.clusterConfigLister = clusterConfigInformer.Lister()
	ctrl.clusterConfigListerSynced = clusterConfigInformer.Informer().HasSynced

	return ctrl
}

func (c *ClusterConfigController) addClusterConfig(obj interface{}) {
	cfg, ok := obj.(*udsv1alpha1.ClusterConfig)
	if !ok {
		return
	}
	c.enqueue(cfg)
}

// HandleUpdate is called when a ClusterConfig is updated.
func (c *ClusterConfigController) updateClusterConfig(old, cur interface{}) {
	cfg, ok := cur.(*udsv1alpha1.ClusterConfig)
	if !ok {
		return
	}
	c.enqueue(cfg)
}

func (c *ClusterConfigController) enqueue(pkg *udsv1alpha1.ClusterConfig) {
	key, err := cache.DeletionHandlingMetaNamespaceKeyFunc(pkg)
	if err != nil {
		c.logger.Error("Couldn't get key for package", "package", pkg, "error", err)
		return
	}

	c.queue.Add(key)
}

// Run starts the workqueue processing loop.
func (c *ClusterConfigController) Run(ctx context.Context, workers int) {
	defer utilruntime.HandleCrash()

	c.logger.Info("Starting package controller")

	var wg sync.WaitGroup
	defer func() {
		c.logger.Info("Shutting down controller", "controller", "deployment")
		c.queue.ShutDown()
		wg.Wait()
	}()

	if !cache.WaitForNamedCacheSync("package", ctx.Done(), c.clusterConfigListerSynced) {
		return
	}

	for i := 0; i < workers; i++ {
		wg.Go(func() {
			wait.UntilWithContext(ctx, c.worker, time.Second)
		})
	}
	<-ctx.Done()
}

// worker runs a worker thread that just dequeues items, processes them, and marks them done.
// It enforces that the syncHandler is never invoked concurrently with the same key.
func (c *ClusterConfigController) worker(ctx context.Context) {
	for c.processNext(ctx) {
	}
}

func (c *ClusterConfigController) processNext(ctx context.Context) bool {
	key, shutdown := c.queue.Get()
	if shutdown {
		return false
	}
	defer c.queue.Done(key)

	err := c.syncHandler(ctx, key)
	if err != nil {
		c.logger.Error("Error processing cluster config", "key", key, "error", err)
		c.queue.AddRateLimited(key)
		return true
	}
	c.queue.Forget(key)
	return true
}

func (c *ClusterConfigController) syncHandler(ctx context.Context, key string) error {
	namespace, name, err := cache.SplitMetaNamespaceKey(key)
	if err != nil {
		c.logger.Error("Failed to split meta namespace cache key", "key", key, "error", err)
		return err
	}

	sharedClusterConfig, err := c.clusterConfigLister.ClusterConfig(namespace).Get(name)
	if err != nil {
		c.logger.Info("Error retrieving cluster config", "error", err)
		return nil
	}

	cfg := sharedClusterConfig.DeepCopy()

	// Always load config into memory (even if generation is already processed).
	// The skip guards only prevent re-patching status, not re-loading in-memory state.
	// This is important on controller restart where the config must be re-loaded from the CR.
	c.logger.Info("Loading ClusterConfig into memory",
		"name", cfg.Name, "generation", cfg.Generation,
		"domain", cfg.Spec.Expose.Domain)

	udscfg.Update(func(c *udscfg.Config) {
		// Domain — fallback to "uds.dev" if empty or unresolved Zarf placeholder
		domain := cfg.Spec.Expose.Domain
		if domain == "" || domain == "###ZARF_VAR_DOMAIN###" {
			domain = "uds.dev"
		}
		c.Domain = domain

		// AdminDomain — fallback to "admin.<domain>" if not set or unresolved placeholder
		if cfg.Spec.Expose.AdminDomain != nil &&
			*cfg.Spec.Expose.AdminDomain != "" &&
			*cfg.Spec.Expose.AdminDomain != "###ZARF_VAR_ADMIN_DOMAIN###" {
			c.AdminDomain = *cfg.Spec.Expose.AdminDomain
		} else {
			c.AdminDomain = "admin." + domain
		}

		c.AllowAllNSExemptions = cfg.Spec.Policy.AllowAllNsExemptions

		if cfg.Spec.Networking != nil {
			c.KubeApiCIDR = ptr.Deref(cfg.Spec.Networking.KubeApiCIDR, "")
			c.KubeNodeCIDRs = cfg.Spec.Networking.KubeNodeCIDRs
		}

		if cfg.Spec.CABundle != nil {
			c.CABundle.Certs = ptr.Deref(cfg.Spec.CABundle.Certs, "")
			c.CABundle.IncludeDoDCerts = ptr.Deref(cfg.Spec.CABundle.IncludeDoDCerts, false)
			c.CABundle.IncludePublicCerts = ptr.Deref(cfg.Spec.CABundle.IncludePublicCerts, false)
		}
	})

	loaded := udscfg.Get()
	c.logger.Info("Loaded UDS Config",
		"domain", loaded.Domain,
		"adminDomain", loaded.AdminDomain,
		"allowAllNSExemptions", loaded.AllowAllNSExemptions,
		"kubeApiCIDR", loaded.KubeApiCIDR,
		"kubeNodeCIDRs", loaded.KubeNodeCIDRs,
	)

	// TODO: patch ClusterConfig status to Ready (and Failed on error) once the dynamic
	// client is wired into controllers.

	return nil
}
