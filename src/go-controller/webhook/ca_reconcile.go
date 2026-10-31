// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package webhook

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"

	admissionv1 "k8s.io/api/admissionregistration/v1"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/client-go/kubernetes"
)

func reconcileCABundle(ctx context.Context, client kubernetes.Interface, name string, mutating bool, ca []byte, secret *corev1.Secret) (bool, error) {
	var current [][]byte
	version := ""
	expected := expectedCallbacks(name, mutating)
	registered := true
	if mutating {
		config, err := client.AdmissionregistrationV1().MutatingWebhookConfigurations().Get(ctx, name, metav1.GetOptions{})
		if err != nil {
			return false, err
		}
		version = config.ResourceVersion
		registered = len(config.Webhooks) == len(expected)
		for _, webhook := range config.Webhooks {
			current = append(current, webhook.ClientConfig.CABundle)
			registered = registered && callbackMatches(webhook.Name, webhook.FailurePolicy, webhook.ClientConfig.Service, expected)
		}
	} else {
		config, err := client.AdmissionregistrationV1().ValidatingWebhookConfigurations().Get(ctx, name, metav1.GetOptions{})
		if err != nil {
			return false, err
		}
		version = config.ResourceVersion
		registered = len(config.Webhooks) == len(expected)
		for _, webhook := range config.Webhooks {
			current = append(current, webhook.ClientConfig.CABundle)
			registered = registered && callbackMatches(webhook.Name, webhook.FailurePolicy, webhook.ClientConfig.Service, expected)
		}
	}
	patch := []map[string]interface{}{}
	for index, bundle := range current {
		if !bytes.Equal(bundle, ca) {
			patch = append(patch, map[string]interface{}{"op": "add", "path": fmt.Sprintf("/webhooks/%d/clientConfig/caBundle", index), "value": ca})
		}
	}
	if len(patch) == 0 {
		return registered, nil
	}
	latest, err := client.CoreV1().Secrets(servingNamespace).Get(ctx, servingSecretName, metav1.GetOptions{})
	if err != nil {
		return false, err
	}
	if latest.UID != secret.UID || latest.ResourceVersion != secret.ResourceVersion {
		return false, fmt.Errorf("serving Secret changed during trust reconciliation")
	}
	if version != "" {
		patch = append([]map[string]interface{}{{"op": "test", "path": "/metadata/resourceVersion", "value": version}}, patch...)
	}
	raw, err := json.Marshal(patch)
	if err != nil {
		return false, err
	}
	if mutating {
		_, err = client.AdmissionregistrationV1().MutatingWebhookConfigurations().Patch(ctx, name, types.JSONPatchType, raw, metav1.PatchOptions{})
	} else {
		_, err = client.AdmissionregistrationV1().ValidatingWebhookConfigurations().Patch(ctx, name, types.JSONPatchType, raw, metav1.PatchOptions{})
	}
	return registered && err == nil, err
}

func expectedCallbacks(name string, mutating bool) map[string]string {
	if name == webhookConfigName {
		return map[string]string{"clusterconfig.uds.dev": "/validate-clusterconfig-delete"}
	}
	if name == "uds-controller-resources" {
		return map[string]string{"validate-resources.uds.dev": "/validate-resources", "validate-resources-istio-system.uds.dev": "/validate-resources"}
	}
	if name == mutatingWebhookConfigName {
		return map[string]string{"pods.waypoint.uds.dev": "/mutate-pod-waypoint", "services.waypoint.uds.dev": "/mutate-service-waypoint"}
	}
	if mutating {
		return map[string]string{"mutate-pods.uds.dev": "/mutate-pods", "mutate-pods-istio-system.uds.dev": "/mutate-pods"}
	}
	return map[string]string{"validate-pods.uds.dev": "/validate-pods", "validate-pods-istio-system.uds.dev": "/validate-pods"}
}

func callbackMatches(name string, policy *admissionv1.FailurePolicyType, service *admissionv1.ServiceReference, expected map[string]string) bool {
	path, exists := expected[name]
	return exists && policy != nil && *policy == admissionv1.Fail && service != nil && service.Name == "uds-controller" && service.Namespace == servingNamespace && service.Path != nil && *service.Path == path && (service.Port == nil || *service.Port == 443)
}
