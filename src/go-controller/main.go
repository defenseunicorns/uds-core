// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package main

import (
	"context"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/dynamic/dynamicinformer"
	"k8s.io/client-go/informers"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/cache"

	"github.com/defenseunicorns/uds-core/src/go-controller/internal/controller"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
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

	// Standard informer for built-in resources
	factory := informers.NewSharedInformerFactory(clientset, 0)
	secretInformer := factory.Core().V1().Secrets().Informer()
	secretInformer.AddEventHandler(cache.ResourceEventHandlerFuncs{
		AddFunc: func(obj interface{}) {
			secret, ok := obj.(*corev1.Secret)
			if !ok {
				return
			}
			slog.Info("Secret created", "namespace", secret.Namespace, "name", secret.Name)
		},
	})

	// Dynamic informer for UDS custom resources
	dynamicFactory := dynamicinformer.NewDynamicSharedInformerFactory(dynamicClient, 0)

	packageGVR := schema.GroupVersionResource{Group: "uds.dev", Version: "v1alpha1", Resource: "packages"}
	packageCtrl := controller.NewPackageController()
	dynamicFactory.ForResource(packageGVR).Informer().AddEventHandler(cache.ResourceEventHandlerFuncs{
		AddFunc:    packageCtrl.HandleAdd,
		UpdateFunc: packageCtrl.HandleUpdate,
		DeleteFunc: packageCtrl.HandleDelete,
	})

	clusterConfigGVR := schema.GroupVersionResource{Group: "uds.dev", Version: "v1alpha1", Resource: "clusterconfig"}
	clusterConfigCtrl := controller.NewClusterConfigController()
	dynamicFactory.ForResource(clusterConfigGVR).Informer().AddEventHandler(cache.ResourceEventHandlerFuncs{
		AddFunc:    clusterConfigCtrl.HandleAdd,
		UpdateFunc: clusterConfigCtrl.HandleUpdate,
		// No DeleteFunc — deletion of the ClusterConfig singleton is not expected
	})

	ctx, cancel := signal.NotifyContext(context.Background(), syscall.SIGTERM, syscall.SIGINT)
	defer cancel()

	slog.Info("Starting Go controller")
	factory.Start(ctx.Done())
	factory.WaitForCacheSync(ctx.Done())
	dynamicFactory.Start(ctx.Done())
	dynamicFactory.WaitForCacheSync(ctx.Done())
	slog.Info("Informer caches synced, watching for events")

	<-ctx.Done()
	slog.Info("Shutting down")
}
