// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package clusterconfig

import (
	"context"
	"github.com/defenseunicorns/uds-core/src/go-controller/internal/controller/cabundle"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
	"log/slog"
	"reflect"
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
	kubeClient                kubernetes.Interface
	onChange                  func()
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
	LoadMemory(cfg)
	if c.onChange != nil {
		c.onChange()
	}
	c.enqueue(cfg)
}

// HandleUpdate is called when a ClusterConfig is updated.
func (c *ClusterConfigController) updateClusterConfig(old, cur interface{}) {
	cfg, ok := cur.(*udsv1alpha1.ClusterConfig)
	if !ok {
		return
	}
	prior, ok := old.(*udsv1alpha1.ClusterConfig)
	if ok && reflect.DeepEqual(prior.Spec, cfg.Spec) {
		return
	}
	LoadMemory(cfg)
	if c.onChange != nil {
		c.onChange()
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
	_, name, err := cache.SplitMetaNamespaceKey(key)
	if err != nil {
		return err
	}
	cfg, err := c.udsClient.ClusterConfig().Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		return err
	}
	LoadMemory(cfg)
	if c.kubeClient != nil {
		if err := cabundle.EnsureIstioTrustBundle(ctx, c.kubeClient.CoreV1()); err != nil {
			return err
		}
	}
	if cfg.Status.Phase != nil && *cfg.Status.Phase == udsv1alpha1.ConfigPhaseReady && cfg.Status.ObservedGeneration != nil && *cfg.Status.ObservedGeneration == cfg.Generation {
		return nil
	}
	cfg.Status.Phase = ptr.To(udsv1alpha1.ConfigPhaseReady)
	cfg.Status.ObservedGeneration = ptr.To(cfg.Generation)
	_, err = c.udsClient.ClusterConfig().UpdateStatus(ctx, cfg, metav1.UpdateOptions{})
	return err
}

func (c *ClusterConfigController) Configure(kubeClient kubernetes.Interface, onChange func()) {
	c.kubeClient = kubeClient
	c.onChange = onChange
}

// LoadMemory runs on every replica, before admission opens and Package work starts.
// Missing optional blocks reset overrides instead of retaining values from old specs.
func LoadMemory(cfg *udsv1alpha1.ClusterConfig) {
	udscfg.Update(func(c *udscfg.Config) {
		c.Domain = cfg.Spec.Expose.Domain
		if c.Domain == "" || c.Domain == "###ZARF_VAR_DOMAIN###" {
			c.Domain = "uds.dev"
		}
		c.AdminDomain = ptr.Deref(cfg.Spec.Expose.AdminDomain, "")
		if c.AdminDomain == "" || c.AdminDomain == "###ZARF_VAR_ADMIN_DOMAIN###" {
			c.AdminDomain = "admin." + c.Domain
		}
		c.AllowAllNSExemptions = cfg.Spec.Policy.AllowAllNsExemptions
		c.KubeApiCIDR = ""
		c.KubeNodeCIDRs = nil
		if cfg.Spec.Networking != nil {
			c.KubeApiCIDR = ptr.Deref(cfg.Spec.Networking.KubeApiCIDR, "")
			c.KubeNodeCIDRs = append([]string(nil), cfg.Spec.Networking.KubeNodeCIDRs...)
		}
		c.CABundle.Certs = ""
		c.CABundle.IncludeDoDCerts = false
		c.CABundle.IncludePublicCerts = false
		if cfg.Spec.CABundle != nil {
			c.CABundle.Certs = ptr.Deref(cfg.Spec.CABundle.Certs, "")
			if c.CABundle.Certs == "###ZARF_VAR_CA_BUNDLE_CERTS###" {
				c.CABundle.Certs = ""
			}
			c.CABundle.IncludeDoDCerts = ptr.Deref(cfg.Spec.CABundle.IncludeDoDCerts, false)
			c.CABundle.IncludePublicCerts = ptr.Deref(cfg.Spec.CABundle.IncludePublicCerts, false)
		}
	})
}
