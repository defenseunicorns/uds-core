// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package udspackage

import (
	"context"

	"fmt"
	"log/slog"
	"reflect"

	apierrors "k8s.io/apimachinery/pkg/api/errors"

	"sync"
	"time"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	utilruntime "k8s.io/apimachinery/pkg/util/runtime"
	"k8s.io/apimachinery/pkg/util/wait"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/tools/cache"
	"k8s.io/client-go/util/workqueue"
	"k8s.io/utils/ptr"

	udsv1alpha1 "github.com/defenseunicorns/uds-core/src/go-controller/api/uds/v1alpha1"
	udsv1alpha1client "github.com/defenseunicorns/uds-core/src/go-controller/client/clientset/versioned/typed/uds/v1alpha1"
	udsv1alpha1informer "github.com/defenseunicorns/uds-core/src/go-controller/client/informers/externalversions/uds/v1alpha1"
	udsv1alpha1lister "github.com/defenseunicorns/uds-core/src/go-controller/client/listers/uds/v1alpha1"

	"github.com/defenseunicorns/uds-core/src/go-controller/internal/featureflags"
	"github.com/defenseunicorns/uds-core/src/go-controller/internal/store"
)

// PackageController handles reconciliation of UDS Package resources.
type PackageController struct {
	queue workqueue.TypedRateLimitingInterface[string]

	logger *slog.Logger

	kubeClient    kubernetes.Interface
	dynamicClient dynamic.Interface

	udsClient           udsv1alpha1client.UdsV1alpha1Interface
	packageLister       udsv1alpha1lister.UDSPackageLister
	packageListerSynced cache.InformerSynced

	flags         featureflags.Flags
	recovery      *recoveryState
	waypointStore *store.WaypointStore
	reconcileMu   sync.Mutex
}

// NewController creates a new PackageController.
func NewController(udsClient udsv1alpha1client.UdsV1alpha1Interface,
	packageInformer udsv1alpha1informer.UDSPackageInformer, kubeClient kubernetes.Interface,
	dynamicClient dynamic.Interface, flags featureflags.Flags, ws *store.WaypointStore) *PackageController {
	ctrl := &PackageController{
		queue: workqueue.NewTypedRateLimitingQueueWithConfig(
			workqueue.NewTypedItemExponentialFailureRateLimiter[string](time.Second, 30*time.Second),
			workqueue.TypedRateLimitingQueueConfig[string]{Name: "package"},
		),
		logger: slog.Default(),

		udsClient:     udsClient,
		kubeClient:    kubeClient,
		dynamicClient: dynamicClient,

		flags:         flags,
		recovery:      newRecoveryState(),
		waypointStore: ws,
	}

	packageInformer.Informer().AddEventHandler(cache.ResourceEventHandlerFuncs{
		AddFunc: func(obj interface{}) {
			ctrl.addPackage(obj)
		},
		UpdateFunc: func(oldObj, newObj interface{}) {
			ctrl.updatePackage(oldObj, newObj)
		},
		DeleteFunc: func(obj interface{}) {
			ctrl.deletePackage(obj)
		},
	})
	ctrl.packageLister = packageInformer.Lister()
	ctrl.packageListerSynced = packageInformer.Informer().HasSynced

	return ctrl
}

func (c *PackageController) addPackage(obj interface{}) {
	pkg, ok := obj.(*udsv1alpha1.UDSPackage)
	if !ok {
		return
	}
	c.syncWaypointStore(pkg)
	c.recovery.invalidate(pkg.UID)
	c.enqueue(pkg)
	if pkg.Namespace == "keycloak" && pkg.Name == "keycloak" {
		c.RequeueAll()
	}
}

func (c *PackageController) updatePackage(old, cur interface{}) {
	pkg, ok := cur.(*udsv1alpha1.UDSPackage)
	if !ok {
		return
	}
	prior, ok := old.(*udsv1alpha1.UDSPackage)
	if ok && prior.UID != pkg.UID {
		c.waypointStore.DeleteForPackage(prior.Namespace, string(prior.UID))
	}
	// Status-only Ready publication warms topology on every serving replica,
	// while remaining excluded from the leader's reconciliation workqueue.
	c.syncWaypointStore(pkg)
	if ok && prior.UID == pkg.UID && prior.Generation == pkg.Generation && reflect.DeepEqual(prior.DeletionTimestamp, pkg.DeletionTimestamp) && reflect.DeepEqual(prior.Finalizers, pkg.Finalizers) {
		return
	}
	c.recovery.invalidate(pkg.UID)
	c.enqueue(pkg)
	if pkg.Namespace == "keycloak" && pkg.Name == "keycloak" {
		c.RequeueAll()
	}
}

func (c *PackageController) deletePackage(obj interface{}) {
	pkg, ok := obj.(*udsv1alpha1.UDSPackage)
	if !ok {
		tombstone, ok := obj.(cache.DeletedFinalStateUnknown)
		if !ok {
			c.logger.Error("Could not decode deleted package object")
			return
		}
		pkg, ok = tombstone.Obj.(*udsv1alpha1.UDSPackage)
		if !ok {
			c.logger.Error("Tombstone contained object that is not a Package", "object", tombstone.Obj)
			return
		}
	}

	c.logger.Info("Package deleted", "namespace", pkg.Namespace, "name", pkg.Name)
	c.recovery.remove(pkg.UID)
	c.waypointStore.DeleteForPackage(pkg.Namespace, string(pkg.UID))
	c.enqueue(pkg)
	if pkg.Namespace == "keycloak" && pkg.Name == "keycloak" {
		c.RequeueAll()
	}
}

func (c *PackageController) enqueue(pkg *udsv1alpha1.UDSPackage) {
	key, err := cache.DeletionHandlingMetaNamespaceKeyFunc(pkg)
	if err != nil {
		c.logger.Error("Couldn't get key for package", "package", pkg, "error", err)
		return
	}

	c.queue.Add(key)
	c.logger.Info("Package enqueued", "key", key, "generation", pkg.Generation, "resourceVersion", pkg.ResourceVersion, "queueDepth", c.queue.Len())
}

// Run starts the workqueue processing loop.
func (c *PackageController) Run(ctx context.Context, workers int) {
	defer utilruntime.HandleCrash()

	c.logger.Info("Starting package controller")

	var wg sync.WaitGroup
	defer func() {
		c.logger.Info("Shutting down controller", "controller", "deployment")
		c.queue.ShutDown()
		wg.Wait()
	}()

	if !cache.WaitForNamedCacheSync("package", ctx.Done(), c.packageListerSynced) {
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
func (c *PackageController) worker(ctx context.Context) {
	for c.processNext(ctx) {
	}
}

func (c *PackageController) processNext(ctx context.Context) bool {
	key, shutdown := c.queue.Get()
	if shutdown {
		return false
	}
	defer c.queue.Done(key)
	c.logger.Info("Package dequeued", "key", key, "queueDepth", c.queue.Len())

	err := c.syncHandler(ctx, key)
	if err != nil {
		c.logger.Error("Error processing package", "key", key, "error", err)
		c.queue.AddRateLimited(key)
		return true
	}
	c.queue.Forget(key)
	return true
}

func (c *PackageController) syncHandler(ctx context.Context, key string) error {
	queuedAt := time.Now()
	c.reconcileMu.Lock()
	defer c.reconcileMu.Unlock()
	c.logger.Info("Package writing authority acquired", "key", key, "serializationWaitSeconds", time.Since(queuedAt).Seconds())
	namespace, name, err := cache.SplitMetaNamespaceKey(key)
	if err != nil {
		c.logger.Error("Failed to split meta namespace cache key", "key", key, "error", err)
		return err
	}

	sharedPkg, err := c.udsClient.UDSPackages(namespace).Get(ctx, name, metav1.GetOptions{})
	if apierrors.IsNotFound(err) {
		return nil
	}
	if err != nil {
		return err
	}

	// Deep-copy otherwise we are mutating our cache.
	pkg := sharedPkg.DeepCopy()

	// Check for deletion
	if pkg.DeletionTimestamp != nil {
		return c.handleFinalizer(ctx, pkg)
	}

	started := time.Now()
	err = c.reconcile(ctx, pkg)
	c.logger.Info("Package reconciliation finished", "key", key, "generation", pkg.Generation, "durationSeconds", time.Since(started).Seconds(), "error", err)
	return err
}

// reconcile brings the cluster state into alignment with the desired state.
func (c *PackageController) reconcile(ctx context.Context, pkg *udsv1alpha1.UDSPackage) error {
	namespace := pkg.Namespace
	name := pkg.Name

	c.logger.Info("Reconciling package",
		"namespace", namespace,
		"name", name,
		"phase", pkg.Status.Phase,
		"observedGeneration", pkg.Status.ObservedGeneration,
		"retryAttempt", pkg.Status.RetryAttempt,
	)

	if c.shouldSkip(pkg) {
		c.logger.Info("Skipping package reconciliation",
			"namespace", namespace, "name", name,
			"phase", pkg.Status.Phase,
			"observedGeneration", pkg.Status.ObservedGeneration,
		)
		return nil
	}

	if err := c.ensureFinalizer(ctx, pkg); err != nil {
		return err
	}
	epoch := c.recovery.capture(pkg.UID)
	if pkg.Status.Phase != nil && (*pkg.Status.Phase == udsv1alpha1.PhaseReady || *pkg.Status.Phase == udsv1alpha1.PhaseFailed) && pkg.Status.ObservedGeneration != nil && *pkg.Status.ObservedGeneration != pkg.Generation {
		pkg.Status.RetryAttempt = ptr.To(int64(0))
	}

	pkg.Status.Phase = ptr.To(udsv1alpha1.PhasePending)
	pkg.Status.Conditions = readinessConditions(false)
	// Journal prospective external clients before the first side effect. The union
	// survives failed attempts, crashes, and deletion before Ready is published.
	if c.flags.SSO || c.flags.IstioInjection {
		if err := c.checkSSOOwnership(pkg); err != nil {
			return c.handleFailure(ctx, pkg, err, epoch)
		}
	}
	if c.flags.SSO {
		journalSSOOwnership(pkg)
	}
	pkg, err := c.udsClient.UDSPackages(pkg.Namespace).UpdateStatus(ctx, pkg, metav1.UpdateOptions{})
	if err != nil {
		return fmt.Errorf("set Pending status: %w", err)
	}

	// Run the reconciliation flow
	if err := c.reconcilePackageFlow(ctx, pkg); err != nil {
		return c.handleFailure(ctx, pkg, err, epoch)
	}

	c.recovery.complete(pkg.UID, epoch)
	return nil
}
