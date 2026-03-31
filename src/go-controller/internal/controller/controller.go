// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package controller

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/dynamic/dynamicinformer"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/cache"

	udsclient "github.com/defenseunicorns/uds-core/src/go-controller/client/clientset/versioned"
	udsinformer "github.com/defenseunicorns/uds-core/src/go-controller/client/informers/externalversions"
	"github.com/defenseunicorns/uds-core/src/go-controller/internal/controller/clusterconfig"
	"github.com/defenseunicorns/uds-core/src/go-controller/internal/controller/sso"
	"github.com/defenseunicorns/uds-core/src/go-controller/internal/controller/udspackage"
	"github.com/defenseunicorns/uds-core/src/go-controller/internal/featureflags"
	"github.com/defenseunicorns/uds-core/src/go-controller/webhook"
)

type Controller struct {
	config *rest.Config
}

func NewController(ctx context.Context) (*Controller, error) {
	config, err := rest.InClusterConfig()
	if err != nil {
		return nil, fmt.Errorf("Failed to get in-cluster config: %w", err)
	}

	return &Controller{
		config: config,
	}, nil
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
			return "", nil
		}
		return string(data), nil
	})

	// Best-effort: ensure the Keycloak operator secret exists at startup.
	// If the keycloak namespace doesn't exist yet, this will fail gracefully
	// and the secret will be ensured during SSO reconciliation instead.
	if flags.SSO {
		sso.EnsureOperatorSecret(context.Background(), clientset.CoreV1())
	}

	// create controllers
	packageCtrl := udspackage.NewController(udsClient.UdsV1alpha1(),
		udsInformer.Uds().V1alpha1().UDSPackages(), clientset,
		dynamicClient, flags)
	clusterConfigCtrl := clusterconfig.NewClusterConfigController(udsClient.UdsV1alpha1(),
		udsInformer.Uds().V1alpha1().ClusterConfig())

	// start informers
	udsInformer.Start(ctx.Done())

	// start the controllers
	slog.Info("Starting controllers")
	go packageCtrl.Run(ctx, 2)
	// TODO(maciej): this controller is not needed at all, since all it does is
	// keep a local copy of a remote resource, and we have that through cluster config
	// lister, which is a local cache that handles just that for us
	go clusterConfigCtrl.Run(ctx, 1)

	// Exemption store for webhook policy enforcement
	exemptions := webhook.NewExemptionStore()
	exemptionGVR := schema.GroupVersionResource{Group: "uds.dev", Version: "v1alpha1", Resource: "exemptions"}
	dynamicFactory.ForResource(exemptionGVR).Informer().AddEventHandler(cache.ResourceEventHandlerFuncs{
		AddFunc: func(obj interface{}) {
			u, ok := obj.(*unstructured.Unstructured)
			if !ok {
				return
			}
			uid, entries, err := webhook.ParseExemptionEntries(u.Object)
			if err != nil {
				slog.Error("Failed to parse exemption", "error", err)
				return
			}
			slog.Info("Loaded exemption", "uid", uid, "entries", len(entries))
			exemptions.Set(uid, entries)
		},
		UpdateFunc: func(_, obj interface{}) {
			u, ok := obj.(*unstructured.Unstructured)
			if !ok {
				return
			}
			uid, entries, err := webhook.ParseExemptionEntries(u.Object)
			if err != nil {
				slog.Error("Failed to parse exemption", "error", err)
				return
			}
			slog.Info("Updated exemption", "uid", uid, "entries", len(entries))
			exemptions.Set(uid, entries)
		},
		DeleteFunc: func(obj interface{}) {
			u, ok := obj.(*unstructured.Unstructured)
			if !ok {
				return
			}
			uid, _, _ := webhook.ParseExemptionEntries(u.Object)
			slog.Info("Removed exemption", "uid", uid)
			exemptions.Remove(uid)
		},
	})

	if err := webhook.StartWebhookServer(ctx, clientset, exemptions); err != nil {
		return fmt.Errorf("Failed to start webhook server: %w", err)
	}

	<-ctx.Done()
	slog.Info("Shutting down")

	return nil
}
