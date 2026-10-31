// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
package istio

import (
	"context"
	"encoding/json"
	"fmt"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/types"
	coreclient "k8s.io/client-go/kubernetes/typed/core/v1"
	"strings"
)

func releaseNamespaceFields(ctx context.Context, client coreclient.CoreV1Interface, ns *corev1.Namespace) (*corev1.Namespace, error) {
	for i, entry := range ns.ManagedFields {
		if entry.Manager != "pepr" || entry.Operation != metav1.ManagedFieldsOperationApply || entry.FieldsV1 == nil {
			continue
		}
		var fields map[string]interface{}
		if err := json.Unmarshal(entry.FieldsV1.Raw, &fields); err != nil {
			return nil, err
		}
		if !namespaceOverClaimed(fields) {
			continue
		}
		ops := []map[string]interface{}{}
		if ns.ResourceVersion != "" {
			ops = append(ops, map[string]interface{}{"op": "test", "path": "/metadata/resourceVersion", "value": ns.ResourceVersion})
		}
		ops = append(ops, map[string]interface{}{"op": "test", "path": fmt.Sprintf("/metadata/managedFields/%d/manager", i), "value": "pepr"}, map[string]interface{}{"op": "remove", "path": fmt.Sprintf("/metadata/managedFields/%d", i)})
		patch, _ := json.Marshal(ops)
		return client.Namespaces().Patch(ctx, ns.Name, types.JSONPatchType, patch, metav1.PatchOptions{})
	}
	return ns, nil
}
func namespaceOverClaimed(fields map[string]interface{}) bool {
	for key, value := range fields {
		if key != "f:metadata" {
			return true
		}
		metadata, _ := value.(map[string]interface{})
		for key, value := range metadata {
			if key != "f:labels" && key != "f:annotations" {
				return true
			}
			entries, _ := value.(map[string]interface{})
			for field := range entries {
				if key == "f:labels" && field != "f:"+injectionLabel && field != "f:"+ambientLabel {
					return true
				}
				if key == "f:annotations" && field != "f:"+originalStateAnnotation && !strings.HasPrefix(field, "f:uds.dev/pkg-") {
					return true
				}
			}
		}
	}
	return false
}
