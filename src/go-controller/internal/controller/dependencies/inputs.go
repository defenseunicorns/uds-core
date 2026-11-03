// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package dependencies

import (
	"context"
	"fmt"
	"github.com/defenseunicorns/uds-core/src/go-controller/internal/config"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/fields"
	"k8s.io/client-go/informers"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/tools/cache"
)

// Inputs separates configuration contents from opt-in reload data and discovery.
// Workload Pods and unfiltered Secrets/ConfigMaps are never cached. The only
// Pod input is the namespace- and label-scoped API tunnel agent discovery.
type Inputs struct {
	APITunnels                                cache.SharedIndexInformer
	Nodes, Namespaces, Endpoints, APIService  cache.SharedIndexInformer
	Operator, Identity, Authservice, Blackbox cache.SharedIndexInformer
	Mesh, Certificates, NetworkPolicies       cache.SharedIndexInformer
	ReloadSecrets, ReloadConfigMaps           cache.SharedIndexInformer
	factories                                 []informers.SharedInformerFactory
}

func NewInputs(client kubernetes.Interface) *Inputs {
	i := &Inputs{}
	factory := func(namespace, name, selector string) informers.SharedInformerFactory {
		f := informers.NewSharedInformerFactoryWithOptions(client, 0,
			informers.WithNamespace(namespace), informers.WithTweakListOptions(func(options *metav1.ListOptions) {
				options.LabelSelector = selector
				if name != "" {
					options.FieldSelector = fields.OneTermEqualSelector("metadata.name", name).String()
				}
			}))
		i.factories = append(i.factories, f)
		return f
	}
	cluster := factory("", "", "")
	i.Nodes = cluster.Core().V1().Nodes().Informer()
	i.Namespaces = cluster.Core().V1().Namespaces().Informer()
	i.Endpoints = factory("default", "", "kubernetes.io/service-name=kubernetes").Discovery().V1().EndpointSlices().Informer()
	i.APITunnels = factory(config.APITunnelNamespace, "", "app="+config.APITunnelApp).Core().V1().Pods().Informer()
	_ = i.APITunnels.SetTransform(trimAPITunnelPod)
	i.APIService = factory("default", "kubernetes", "").Core().V1().Services().Informer()
	i.Operator = factory("uds-system", "uds-operator-config", "").Core().V1().Secrets().Informer()
	i.Identity = factory("keycloak", "keycloak-client-secrets", "").Core().V1().Secrets().Informer()
	i.Authservice = factory("authservice", "authservice-uds", "").Core().V1().Secrets().Informer()
	i.Blackbox = factory("monitoring", "uds-prometheus-blackbox-config", "").Core().V1().Secrets().Informer()
	i.Mesh = factory("istio-system", "istio", "").Core().V1().ConfigMaps().Informer()
	i.Certificates = factory("uds-system", "uds-ca-certs", "").Core().V1().ConfigMaps().Informer()
	// Keep old metadata when labels/owners are removed so drift repair can still
	// target the previous owner. These objects do not contain credential data.
	i.NetworkPolicies = cluster.Networking().V1().NetworkPolicies().Informer()
	reload := factory("", "", "uds.dev/pod-reload=true")
	i.ReloadSecrets = reload.Core().V1().Secrets().Informer()
	i.ReloadConfigMaps = reload.Core().V1().ConfigMaps().Informer()
	return i
}

func (i *Inputs) Start(ctx context.Context) error {
	for _, factory := range i.factories {
		factory.Start(ctx.Done())
	}
	for _, factory := range i.factories {
		for resource, synced := range factory.WaitForCacheSync(ctx.Done()) {
			if !synced {
				return fmt.Errorf("dependency informer %s failed to sync: %w", resource, ctx.Err())
			}
		}
	}
	return nil
}
