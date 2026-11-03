// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
package dependencies

import (
	"reflect"
	"strings"

	corev1 "k8s.io/api/core/v1"
	"k8s.io/client-go/tools/cache"
)

func (c *Controller) watchNamespaceLifecycle(informer cache.SharedIndexInformer) {
	informer.AddEventHandler(cache.ResourceEventHandlerFuncs{
		AddFunc: c.namespaceChanged, DeleteFunc: c.namespaceChanged,
		UpdateFunc: func(old, current interface{}) {
			before, beforeOK := old.(*corev1.Namespace)
			after, afterOK := current.(*corev1.Namespace)
			if !beforeOK || !afterOK || before.UID != after.UID || before.Status.Phase != after.Status.Phase || !reflect.DeepEqual(before.DeletionTimestamp, after.DeletionTimestamp) {
				c.namespaceChanged(current)
			}
			if beforeOK && afterOK && !reflect.DeepEqual(meshMetadata(before), meshMetadata(after)) && c.packages != nil {
				c.packages.RequeueNamespace(after.Name)
			}
		},
	})
}

func meshMetadata(namespace *corev1.Namespace) map[string]string {
	result := map[string]string{}
	for _, key := range []string{"istio-injection", "istio.io/dataplane-mode"} {
		if value, ok := namespace.Labels[key]; ok {
			result[key] = value
		}
	}
	for key, value := range namespace.Annotations {
		if strings.HasPrefix(key, "uds.dev/pkg-") || key == "uds.dev/original-istio-state" || key == "uds.dev/istio-restart-pending" {
			result[key] = value
		}
	}
	return result
}

func (c *Controller) namespaceChanged(obj interface{}) {
	if deleted, ok := obj.(cache.DeletedFinalStateUnknown); ok {
		obj = deleted.Obj
	}
	if namespace, ok := obj.(*corev1.Namespace); ok && namespace.Name == "authservice" {
		// The initial global-config pass may precede this namespace. Retry through
		// the existing leader-owned queue; standby replicas never write config.
		c.queue.Add("config")
	}
	if namespace, ok := obj.(*corev1.Namespace); ok && c.packages != nil {
		c.packages.RequeueNamespace(namespace.Name)
	}
}
