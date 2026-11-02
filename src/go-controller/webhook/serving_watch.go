// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package webhook

import (
	"context"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/fields"
	"k8s.io/client-go/informers"
	"k8s.io/client-go/tools/cache"
	"log/slog"
	"time"
)

// Watch only the eight installation objects used by serving reconciliation.
// Events trigger live ownership/CAS checks; no cluster-wide Secret cache exists.
func (m *ServingManager) watch(ctx context.Context) <-chan struct{} {
	wake := make(chan struct{}, 1)
	changed := func(interface{}) {
		select {
		case wake <- struct{}{}:
		default:
		}
	}
	start := func(name, namespace, kind string) {
		factory := informers.NewSharedInformerFactoryWithOptions(m.client, 0, informers.WithNamespace(namespace), informers.WithTweakListOptions(func(o *metav1.ListOptions) {
			o.FieldSelector = fields.OneTermEqualSelector("metadata.name", name).String()
		}))
		var informer cache.SharedIndexInformer
		switch kind {
		case "secret":
			informer = factory.Core().V1().Secrets().Informer()
		case "configmap":
			informer = factory.Core().V1().ConfigMaps().Informer()
		case "role":
			informer = factory.Rbac().V1().ClusterRoles().Informer()
		case "mutating":
			informer = factory.Admissionregistration().V1().MutatingWebhookConfigurations().Informer()
		case "validating":
			informer = factory.Admissionregistration().V1().ValidatingWebhookConfigurations().Informer()
		}
		informer.AddEventHandler(cache.ResourceEventHandlerFuncs{AddFunc: changed, DeleteFunc: changed, UpdateFunc: func(_, obj interface{}) { changed(obj) }})
		factory.Start(ctx.Done())
	}
	start(servingSecretName, servingNamespace, "secret")
	start(registrationPlanName, servingNamespace, "configmap")
	start("uds-controller", "", "role")
	for _, target := range registrationTargets {
		kind := "validating"
		if target.mutating {
			kind = "mutating"
		}
		start(target.name, "", kind)
	}
	return wake
}
func (m *ServingManager) Run(ctx context.Context) {
	wake := m.watch(ctx)
	timer := time.NewTimer(0)
	defer timer.Stop()
	for {
		select {
		case <-ctx.Done():
			m.ready.Store(false)
			return
		case <-wake:
		case <-timer.C:
		}
		// Coalesce bursts from our own bundle publication and informer initial lists.
		debounce := time.NewTimer(100 * time.Millisecond)
		select {
		case <-ctx.Done():
			debounce.Stop()
			m.ready.Store(false)
			return
		case <-debounce.C:
		}
		select {
		case <-wake:
		default:
		}
		syncCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
		err := m.Synchronize(syncCtx)
		cancel()
		delay := time.Hour // Renewal checks continue even when no Kubernetes object changes.
		if err != nil {
			delay = 2 * time.Second
			if ctx.Err() == nil {
				slog.Error("Admission trust reconciliation failed", "error", err)
			}
		} else {
			m.mu.Lock()
			next := m.nextSync
			m.mu.Unlock()
			if !next.IsZero() {
				delay = max(time.Millisecond, next.Sub(m.now()))
			}
		}
		if !timer.Stop() {
			select {
			case <-timer.C:
			default:
			}
		}
		timer.Reset(delay)
	}
}
