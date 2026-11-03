// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package reload

import (
	"context"
	"encoding/json"
	corev1 "k8s.io/api/core/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/client-go/kubernetes"
)

// CleanupControllerFields releases historical Pepr ownership of workload spec
// fields. JSON Patch tests the fetched version and exact manager before removal.
func CleanupControllerFields(ctx context.Context, client kubernetes.Interface, namespace string, pods []corev1.Pod) error {
	handled := map[target]bool{}
	for _, pod := range pods {
		owner, err := controllerTarget(ctx, client, namespace, pod)
		if apierrors.IsNotFound(err) {
			continue
		}
		if err != nil {
			return err
		}
		if owner == nil || handled[*owner] {
			continue
		}
		handled[*owner] = true
		obj, err := getController(ctx, client, namespace, *owner)
		if err != nil {
			return err
		}
		for i, entry := range obj.GetManagedFields() {
			if entry.Manager != "pepr" || entry.Operation != "Apply" || entry.FieldsV1 == nil {
				continue
			}
			var fields map[string]interface{}
			if err := json.Unmarshal(entry.FieldsV1.Raw, &fields); err != nil {
				return err
			}
			if !overClaimed(fields, []string{"f:spec", "f:template", "f:metadata", "f:annotations", "f:uds.dev/restartedAt"}) {
				continue
			}
			patch, _ := json.Marshal([]map[string]interface{}{
				{"op": "test", "path": "/metadata/resourceVersion", "value": obj.GetResourceVersion()},
				{"op": "test", "path": "/metadata/managedFields/" + indexString(i) + "/manager", "value": "pepr"},
				{"op": "remove", "path": "/metadata/managedFields/" + indexString(i)},
			})
			if err := patchController(ctx, client, namespace, *owner, types.JSONPatchType, patch); err != nil {
				return err
			}
			break
		}
	}
	return nil
}

func indexString(i int) string {
	// Manager lists are small; JSON number encoding avoids a second formatting API.
	data, _ := json.Marshal(i)
	return string(data)
}
func overClaimed(fields map[string]interface{}, path []string) bool {
	if len(path) == 0 {
		return len(fields) > 0
	}
	for key, value := range fields {
		if key != path[0] {
			return true
		}
		child, _ := value.(map[string]interface{})
		if overClaimed(child, path[1:]) {
			return true
		}
	}
	return false
}
