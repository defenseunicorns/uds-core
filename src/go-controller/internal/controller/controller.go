// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package controller

import (
	"context"
	"fmt"
	"log/slog"
	"sync"
	"time"

	admissionresources "github.com/defenseunicorns/uds-core/src/go-controller/internal/admission/resources"
	"github.com/defenseunicorns/uds-core/src/go-controller/internal/config"
	"github.com/defenseunicorns/uds-core/src/go-controller/internal/controller/dependencies"
	"github.com/defenseunicorns/uds-core/src/go-controller/internal/controller/observability"
	"github.com/defenseunicorns/uds-core/src/go-controller/internal/controller/reload"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/dynamic/dynamicinformer"
	"k8s.io/client-go/informers"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/cache"

	udsclient "github.com/defenseunicorns/uds-core/src/go-controller/client/clientset/versioned"
	udsinformer "github.com/defenseunicorns/uds-core/src/go-controller/client/informers/externalversions"
	nativeadmission "github.com/defenseunicorns/uds-core/src/go-controller/internal/controller/admission"
	"github.com/defenseunicorns/uds-core/src/go-controller/internal/controller/clusterconfig"
	"github.com/defenseunicorns/uds-core/src/go-controller/internal/controller/sso"
	"github.com/defenseunicorns/uds-core/src/go-controller/internal/controller/udspackage"
	"github.com/defenseunicorns/uds-core/src/go-controller/internal/featureflags"
	"github.com/defenseunicorns/uds-core/src/go-controller/internal/store"
	"github.com/defenseunicorns/uds-core/src/go-controller/webhook"
)

type Controller struct {
	config *rest.Config
}

func NewController(ctx context.Context) (*Controller, error) {
	return NewControllerWithOptions(ctx, DefaultRunOptions())
}

func (c *Controller) Run(ctx context.Context) error {
	// Load feature flags (inverse of Pepr)
	flags := featureflags.Load()
	slog.Info("Feature flags loaded",
		"networkPolicies", flags.NetworkPolicies,
		"authorizationPolicies", flags.AuthorizationPolicies,
		"istioInjection", flags.IstioInjection,
		"istioIngress", flags.IstioIngress,
		"istioEgress", flags.IstioEgress,
		"sso", flags.SSO,
		"podMonitors", flags.PodMonitors,
		"serviceMonitors", flags.ServiceMonitors,
		"uptimeProbes", flags.UptimeProbes,
		"caBundle", flags.CABundle,
	)

	// setup all necessary clients and informers
	clientset, err := kubernetes.NewForConfig(c.config)
	if err != nil {
		return fmt.Errorf("Failed to create Kubernetes client: %w", err)
	}

	dynamicClient, err := dynamic.NewForConfig(c.config)
	if err != nil {
		return fmt.Errorf("Failed to create dynamic client: %w", err)
	}
	dynamicFactory := dynamicinformer.NewDynamicSharedInformerFactory(dynamicClient, 0)

	udsClient, err := udsclient.NewForConfig(c.config)
	if err != nil {
		return fmt.Errorf("Failed to create dynamic client: %w", err)
	}
	udsInformer := udsinformer.NewSharedInformerFactory(udsClient, 1*time.Hour)

	// Set up the Keycloak operator secret getter
	sso.SetOperatorSecretGetter(func(ctx context.Context) (string, error) {
		secret, err := clientset.CoreV1().Secrets("keycloak").Get(ctx, "keycloak-client-secrets", metav1.GetOptions{})
		if err != nil {
			return "", err
		}
		data, ok := secret.Data["uds-operator"]
		if !ok {
			return "", fmt.Errorf("identity operator Secret has no uds-operator credential")
		}
		return string(data), nil
	})

	// Waypoint store shared between package controller and webhook handlers
	ws := store.NewWaypointStore()

	// create controllers
	packageCtrl := udspackage.NewController(udsClient.UdsV1alpha1(),
		udsInformer.Uds().V1alpha1().UDSPackages(), clientset,
		dynamicClient, flags, ws)
	clusterConfigCtrl := clusterconfig.NewClusterConfigController(udsClient.UdsV1alpha1(),
		udsInformer.Uds().V1alpha1().ClusterConfig())

	coreFactory := informers.NewSharedInformerFactory(clientset, 0)
	dependencyCtrl := dependencies.New(clientset, coreFactory, packageCtrl)
	reloadCtrl := reload.NewController(clientset, coreFactory.Core().V1().Secrets().Informer(), coreFactory.Core().V1().ConfigMaps().Informer())
	clusterConfigCtrl.Configure(clientset, dependencyCtrl.ConfigChanged)
	// Watch owned resources to repair deletion or spec drift independently of
	// Package generation. Availability retries cover CRDs installed after boot.
	for _, gvr := range dependencies.OwnedResources() {
		dynamicFactory.ForResource(gvr).Informer().AddEventHandler(dependencyCtrl.OwnedHandlers())
	}
	udsInformer.Start(ctx.Done())
	coreFactory.Start(ctx.Done())
	for resource, synced := range coreFactory.WaitForCacheSync(ctx.Done()) {
		if !synced {
			return fmt.Errorf("core informer %s failed to sync", resource)
		}
	}
	if !cache.WaitForCacheSync(ctx.Done(), udsInformer.Uds().V1alpha1().UDSPackages().Informer().HasSynced, udsInformer.Uds().V1alpha1().ClusterConfig().Informer().HasSynced) {
		return ctx.Err()
	}
	cfg, err := udsClient.UdsV1alpha1().ClusterConfig().Get(ctx, "uds-cluster-config", metav1.GetOptions{})
	if err != nil {
		return fmt.Errorf("load ClusterConfig before admission: %w", err)
	}
	clusterconfig.LoadMemory(cfg)
	dependencyCtrl.Refresh()

	// Exemption store for webhook policy enforcement
	exemptions := webhook.NewExemptionStore()
	exemptionGVR := schema.GroupVersionResource{Group: "uds.dev", Version: "v1alpha1", Resource: "exemptions"}
	exemptionInformer := dynamicFactory.ForResource(exemptionGVR).Informer()
	admissionCompiler := nativeadmission.NewCompiler(dynamicClient, exemptionInformer)
	rebuildExemptions := func() {
		var objects []*unstructured.Unstructured
		for _, obj := range exemptionInformer.GetStore().List() {
			if resource, ok := obj.(*unstructured.Unstructured); ok {
				objects = append(objects, resource)
			}
		}
		if err := exemptions.Replace(objects, config.Get().AllowAllNSExemptions); err != nil {
			slog.Error("Invalid exemption snapshot; privileges revoked", "error", err)
		}
	}
	exemptionInformer.AddEventHandler(cache.ResourceEventHandlerFuncs{AddFunc: func(interface{}) { rebuildExemptions() }, UpdateFunc: func(interface{}, interface{}) { rebuildExemptions() }, DeleteFunc: func(interface{}) { rebuildExemptions() }})
	udsInformer.Uds().V1alpha1().ClusterConfig().Informer().AddEventHandler(cache.ResourceEventHandlerFuncs{AddFunc: func(interface{}) { rebuildExemptions(); admissionCompiler.Enqueue() }, UpdateFunc: func(interface{}, interface{}) { rebuildExemptions(); admissionCompiler.Enqueue() }})
	rawPackageInformer := dynamicFactory.ForResource(schema.GroupVersionResource{Group: "uds.dev", Version: "v1alpha1", Resource: "packages"}).Informer()
	parameterInformer := dynamicFactory.ForResource(schema.GroupVersionResource{Group: "policy.uds.dev", Version: "v1alpha1", Resource: "admissionparameters"}).Informer()
	admissionCompiler.WatchParameters(parameterInformer)
	validatingPolicies := dynamicFactory.ForResource(schema.GroupVersionResource{Group: "admissionregistration.k8s.io", Version: "v1", Resource: "validatingadmissionpolicies"}).Informer()
	mutatingPolicies := dynamicFactory.ForResource(schema.GroupVersionResource{Group: "admissionregistration.k8s.io", Version: "v1", Resource: "mutatingadmissionpolicies"}).Informer()
	validatingBindings := dynamicFactory.ForResource(schema.GroupVersionResource{Group: "admissionregistration.k8s.io", Version: "v1", Resource: "validatingadmissionpolicybindings"}).Informer()
	mutatingBindings := dynamicFactory.ForResource(schema.GroupVersionResource{Group: "admissionregistration.k8s.io", Version: "v1", Resource: "mutatingadmissionpolicybindings"}).Informer()
	health := observability.New(observability.Sources{SnapshotCurrent: func(revision string) bool {
		_, current, ready := exemptions.MetadataSnapshot(admissionresources.Object{})
		return ready && current == revision
	}, CachesReady: func() bool {
		return exemptionInformer.HasSynced() && rawPackageInformer.HasSynced() && parameterInformer.HasSynced() && validatingPolicies.HasSynced() && mutatingPolicies.HasSynced() && validatingBindings.HasSynced() && mutatingBindings.HasSynced() && exemptions.Ready()
	}, ServingReady: webhook.AdmissionReady, CallbacksReady: webhook.AdmissionRegistered, Parameters: parameterInformer.GetStore(), ValidatingPolicies: validatingPolicies.GetStore(), MutatingPolicies: mutatingPolicies.GetStore(), ValidatingBindings: validatingBindings.GetStore(), MutatingBindings: mutatingBindings.GetStore()})

	// Start the dynamic factory and wait for exemption cache to sync before
	// opening the webhook server — otherwise the store is empty on first admission.
	dynamicFactory.Start(ctx.Done())
	if !cache.WaitForCacheSync(ctx.Done(), exemptionInformer.HasSynced, rawPackageInformer.HasSynced) {
		return ctx.Err()
	}
	rebuildExemptions()
	slog.Info("Exemption cache synced")

	if err := webhook.StartWebhookServer(ctx, clientset, exemptions, ws, rawPackageInformer); err != nil {
		return fmt.Errorf("Failed to start webhook server: %w", err)
	}
	if err := health.Serve(ctx, ":9090"); err != nil {
		return err
	}

	return runLeader(ctx, clientset, func(leaderCtx context.Context) {
		health.Leadership(leaderCtx)
		defer health.Leader(false)
		var workers sync.WaitGroup
		workers.Go(func() { packageCtrl.Run(leaderCtx, 2) })
		workers.Go(func() { clusterConfigCtrl.Run(leaderCtx, 1) })
		workers.Go(func() { dependencyCtrl.Run(leaderCtx) })
		workers.Go(func() { reloadCtrl.Run(leaderCtx) })
		workers.Go(func() { admissionCompiler.Run(leaderCtx) })
		workers.Wait()
	})
}
