// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
package dependencies

import (
	"github.com/defenseunicorns/uds-core/src/go-controller/internal/config"
	corev1 "k8s.io/api/core/v1"
	"slices"
)

// Retain only identity and address state for the small platform-agent cache.
func trimAPITunnelPod(obj interface{}) (interface{}, error) {
	pod, ok := obj.(*corev1.Pod)
	if !ok {
		return obj, nil
	}
	result := &corev1.Pod{TypeMeta: pod.TypeMeta, ObjectMeta: *pod.ObjectMeta.DeepCopy(),
		Status: corev1.PodStatus{PodIP: pod.Status.PodIP, PodIPs: slices.Clone(pod.Status.PodIPs), Phase: pod.Status.Phase}}
	result.ManagedFields = nil
	result.Annotations = nil
	result.OwnerReferences = nil
	result.Finalizers = nil
	return result, nil
}

func APITunnelCIDRs(objects []interface{}) []string {
	var addresses []string
	for _, obj := range objects {
		pod, ok := obj.(*corev1.Pod)
		if !ok || pod.Namespace != config.APITunnelNamespace || pod.Labels["app"] != config.APITunnelApp ||
			pod.DeletionTimestamp != nil || pod.Status.Phase != corev1.PodRunning {
			continue
		}
		for _, ip := range pod.Status.PodIPs {
			if cidr := hostCIDR(ip.IP); cidr != "" {
				addresses = append(addresses, cidr)
			}
		}
		if cidr := hostCIDR(pod.Status.PodIP); cidr != "" {
			addresses = append(addresses, cidr)
		}
	}
	return uniqueCIDRs(addresses)
}
