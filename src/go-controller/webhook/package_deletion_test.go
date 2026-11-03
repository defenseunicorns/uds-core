// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package webhook

import (
	"testing"

	admissionv1 "k8s.io/api/admission/v1"
)

func TestDeletingPackageUsesAdmissionOldObject(t *testing.T) {
	old := map[string]interface{}{
		"metadata": map[string]interface{}{"name": "app", "namespace": "apps", "deletionTimestamp": "2026-10-31T00:00:00Z"},
		"spec":     map[string]interface{}{"sso": []interface{}{map[string]interface{}{"clientId": "original", "standardFlowEnabled": false}}},
	}
	handler := ValidateResources(topologyInformer(t, nil))
	current := cloneMap(old)
	current["metadata"].(map[string]interface{})["finalizers"] = []interface{}{}
	if result := guardAdmission(t, handler, "Package", admissionv1.Update, "controller", current, old); !result.Allowed {
		t.Fatalf("unchanged spec blocked finalizer removal: %v", result.Result)
	}
	current["spec"].(map[string]interface{})["sso"] = []interface{}{map[string]interface{}{"clientId": "replacement", "standardFlowEnabled": false}}
	if result := guardAdmission(t, handler, "Package", admissionv1.Update, "tenant", current, old); result.Allowed || result.Result.Message != "Package spec cannot change during deletion." {
		t.Fatalf("deletion accepted changed spec: %v", result)
	}
	if result := guardAdmission(t, handler, "Package", admissionv1.Update, "tenant", old, nil); result.Allowed {
		t.Fatal("deletion accepted missing previous object")
	}
}
