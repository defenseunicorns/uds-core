// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package main

import (
	"context"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/dynamic/dynamicinformer"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/cache"

	"github.com/defenseunicorns/uds-core/src/go-controller/internal/controller"
	"github.com/defenseunicorns/uds-core/src/go-controller/internal/controller/sso"
	"github.com/defenseunicorns/uds-core/src/go-controller/internal/featureflags"
	"github.com/defenseunicorns/uds-core/src/go-controller/webhook"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelDebug}))
	slog.SetDefault(logger)

	config, err := rest.InClusterConfig()
	if err != nil {
		slog.Error("Failed to get in-cluster config", "error", err)
		os.Exit(1)
	}

	clientset, err := kubernetes.NewForConfig(config)
	if err != nil {
		slog.Error("Failed to create Kubernetes client", "error", err)
		os.Exit(1)
	}

	dynamicClient, err := dynamic.NewForConfig(config)
	if err != nil {
		slog.Error("Failed to create dynamic client", "error", err)
		os.Exit(1)
	}

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

	// Set up the Keycloak operator secret getter
	sso.SetOperatorSecretGetter(func(ctx context.Context) (string, error) {
		secret, err := clientset.CoreV1().Secrets("keycloak").Get(ctx, "keycloak-client-secrets", metav1.GetOptions{})
		if err != nil {
			return "", err
		}
		data, ok := secret.Data["uds-operator"]
		if !ok {
			return "", nil
		}
		return string(data), nil
	})

	// Dynamic informer for UDS custom resources
	dynamicFactory := dynamicinformer.NewDynamicSharedInformerFactory(dynamicClient, 0)

	// Package controller with workqueue
	packageGVR := schema.GroupVersionResource{Group: "uds.dev", Version: "v1alpha1", Resource: "packages"}
	packageCtrl := controller.NewPackageController(clientset, dynamicClient, flags)
	dynamicFactory.ForResource(packageGVR).Informer().AddEventHandler(cache.ResourceEventHandlerFuncs{
		AddFunc:    packageCtrl.HandleAdd,
		UpdateFunc: packageCtrl.HandleUpdate,
		DeleteFunc: packageCtrl.HandleDelete,
	})

	// ClusterConfig controller
	clusterConfigGVR := schema.GroupVersionResource{Group: "uds.dev", Version: "v1alpha1", Resource: "clusterconfig"}
	clusterConfigCtrl := controller.NewClusterConfigController()
	dynamicFactory.ForResource(clusterConfigGVR).Informer().AddEventHandler(cache.ResourceEventHandlerFuncs{
		AddFunc:    clusterConfigCtrl.HandleAdd,
		UpdateFunc: clusterConfigCtrl.HandleUpdate,
	})

	ctx, cancel := signal.NotifyContext(context.Background(), syscall.SIGTERM, syscall.SIGINT)
	defer cancel()

	if err := webhook.StartWebhookServer(ctx, clientset); err != nil {
		slog.Error("Failed to start webhook server", "error", err)
		os.Exit(1)
	}

	slog.Info("Starting Go controller")
	dynamicFactory.Start(ctx.Done())
	dynamicFactory.WaitForCacheSync(ctx.Done())
	slog.Info("Informer caches synced, watching for events")

	// Start the package controller workqueue processor
	go packageCtrl.Run(ctx, 2)

	<-ctx.Done()
	slog.Info("Shutting down")
}
