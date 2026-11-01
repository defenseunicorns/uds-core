// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
package dependencies

import (
	"context"
	"reflect"
	"time"

	"github.com/defenseunicorns/uds-core/src/go-controller/internal/config"
	"github.com/defenseunicorns/uds-core/src/go-controller/internal/controller/sso"
	corev1 "k8s.io/api/core/v1"
	discoveryv1 "k8s.io/api/discovery/v1"
)

func discoveryInput(obj interface{}) string {
	switch v := obj.(type) {
	case *corev1.Node:
		return "nodes"
	case *discoveryv1.EndpointSlice:
		if v.Namespace == "default" && v.Labels[discoveryv1.LabelServiceName] == "kubernetes" {
			return "endpoints"
		}
	case *corev1.Service:
		if v.Namespace == "default" && v.Name == "kubernetes" {
			return "service"
		}
	case *corev1.Secret:
		if v.Namespace == "uds-system" && v.Name == "uds-operator-config" {
			return "operator"
		}
	case *corev1.ConfigMap:
		if v.Namespace == "uds-system" && v.Name == "uds-ca-certs" {
			return "certs"
		}
	}
	return ""
}

// StartDiscovery runs on every admission replica, independently of leadership.
// Initial lists produce one snapshot. Subsequent bursts coalesce, and only the
// input sets that changed are recomputed. No Kubernetes writes run here.
func (c *Controller) StartDiscovery(ctx context.Context) <-chan struct{} {
	c.refresh(map[string]bool{"nodes": true, "endpoints": true, "service": true, "operator": true, "certs": true})
	c.queue.Add("gateway")
	done := make(chan struct{})
	go func() {
		defer close(done)
		for {
			select {
			case <-ctx.Done():
				return
			case <-c.discoveryWake:
			}
			timer := time.NewTimer(100 * time.Millisecond)
			select {
			case <-ctx.Done():
				timer.Stop()
				return
			case <-timer.C:
			}
			c.discoveryMu.Lock()
			dirty := c.dirty
			c.dirty = map[string]bool{}
			c.discoveryMu.Unlock()
			if len(dirty) > 0 {
				c.refresh(dirty)
			}
		}
	}()
	return done
}

func (c *Controller) refresh(dirty map[string]bool) {
	prior := config.Get()
	config.Update(func(cfg *config.Config) {
		if dirty["nodes"] {
			cfg.DiscoveredNodeCIDRs = NodeCIDRs(c.inputs.Nodes.GetStore().List())
		}
		if dirty["endpoints"] {
			cfg.DiscoveredAPICIDRs = EndpointCIDRs(c.inputs.Endpoints.GetStore().List())
		}
		if dirty["service"] {
			obj, _, _ := c.inputs.APIService.GetStore().GetByKey("default/kubernetes")
			cfg.APIServiceCIDRs = ServiceCIDRs(obj)
		}
		if dirty["operator"] {
			obj, _, _ := c.inputs.Operator.GetStore().GetByKey("uds-system/uds-operator-config")
			LoadOperatorSecret(cfg, obj)
		}
		if dirty["certs"] {
			obj, _, _ := c.inputs.Certificates.GetStore().GetByKey("uds-system/uds-ca-certs")
			cfg.CABundle.DoDCerts, cfg.CABundle.PublicCerts = "", ""
			if cm, ok := obj.(*corev1.ConfigMap); ok {
				cfg.CABundle.DoDCerts, cfg.CABundle.PublicCerts = cm.Data["dodCACerts"], cm.Data["publicCACerts"]
			}
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
