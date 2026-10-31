// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
package observability

import (
	"context"
	"encoding/json"
	"github.com/prometheus/client_golang/prometheus"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/client-go/tools/cache"
	"os"
	"testing"
)

func healthy(t *testing.T) (*Health, *bool, *bool, *bool) {
	t.Helper()
	ready, serving, registered := true, true, true
	parameters := cache.NewStore(cache.MetaNamespaceKeyFunc)
	validatingStore, mutatingStore := cache.NewStore(cache.MetaNamespaceKeyFunc), cache.NewStore(cache.MetaNamespaceKeyFunc)
	validatingPolicies, mutatingPolicies := cache.NewStore(cache.MetaNamespaceKeyFunc), cache.NewStore(cache.MetaNamespaceKeyFunc)
	fixture, err := os.ReadFile("../../../chart/files/native-admission/policies.json")
	if err != nil {
		t.Fatal(err)
	}
	var list struct {
		Items []map[string]interface{} `json:"items"`
	}
	if err := json.Unmarshal(fixture, &list); err != nil {
		t.Fatal(err)
	}
	for _, obj := range list.Items {
		object := &unstructured.Unstructured{Object: obj}
		object.SetUID(types.UID("persisted-" + object.GetName()))
		object.SetGeneration(1)
		switch obj["kind"] {
		case "ValidatingAdmissionPolicy":
			_ = unstructured.SetNestedField(object.Object, int64(1), "status", "observedGeneration")
			_ = unstructured.SetNestedMap(object.Object, map[string]interface{}{}, "status", "typeChecking")
			_ = validatingPolicies.Add(object)
		case "MutatingAdmissionPolicy":
			_ = mutatingPolicies.Add(object)
		case "ValidatingAdmissionPolicyBinding":
			if obj["apiVersion"] != "admissionregistration.k8s.io/v1" {
				t.Fatal("observer version must match the actual served native API")
			}
			_ = validatingStore.Add(object)
		case "MutatingAdmissionPolicyBinding":
			if obj["apiVersion"] != "admissionregistration.k8s.io/v1" {
				t.Fatal("observer version must match the actual served native API")
			}
			_ = mutatingStore.Add(object)
		}
	}
	_ = parameters.Add(&unstructured.Unstructured{Object: map[string]interface{}{"metadata": map[string]interface{}{"name": "uds-native-grants", "namespace": "uds-policy-exemptions"}, "spec": map[string]interface{}{"valid": true, "revision": "current-valid"}}})
	h := New(Sources{SnapshotCurrent: func(revision string) bool { return revision == "current-valid" }, CachesReady: func() bool { return ready }, ServingReady: func() bool { return serving }, CallbacksReady: func() bool { return registered }, Parameters: parameters, ValidatingPolicies: validatingPolicies, MutatingPolicies: mutatingPolicies, ValidatingBindings: validatingStore, MutatingBindings: mutatingStore})
	h.Leader(true)
	return h, &ready, &serving, &registered
}

func values(t *testing.T, registry *prometheus.Registry) map[string]float64 {
	t.Helper()
	series, err := registry.Gather()
	if err != nil {
		t.Fatal(err)
	}
	out := map[string]float64{}
	for _, family := range series {
		out[family.GetName()] = family.Metric[0].GetGauge().GetValue()
		if family.Metric[0].Label[0].GetValue() != "go-native" {
			t.Fatal("implementation label missing")
		}
	}
	return out
}

func TestLiveCapabilityLossReportsZero(t *testing.T) {
	h, ready, serving, registered := healthy(t)
	for name, value := range values(t, h.registry) {
		if value != 1 {
			t.Fatal(name, value)
		}
	}
	*serving = false
	if values(t, h.registry)["uds_native_admission_ready"] != 0 {
		t.Fatal("failed HTTPS serving was reported ready")
	}
	*serving = true
	*registered = false
	if values(t, h.registry)["uds_native_admission_ready"] != 0 {
		t.Fatal("dormant backend was reported available admission")
	}
	*registered = true
	h.Leader(false)
	if values(t, h.registry)["uds_native_reconciliation_ready"] != 0 {
		t.Fatal("revoked writer authority was reported available")
	}
	h.Leader(true)
	*ready = false
	for name, value := range values(t, h.registry) {
		if value != 0 {
			t.Fatal("unready cache claimed capability", name, value)
		}
	}
}

func TestNativeAuthorityRevocationAndBindingLossReportZero(t *testing.T) {
	h, _, _, _ := healthy(t)
	obj, _, _ := h.sources.Parameters.GetByKey("uds-policy-exemptions/uds-native-grants")
	parameters := obj.(*unstructured.Unstructured).DeepCopy()
	_ = unstructured.SetNestedField(parameters.Object, false, "spec", "valid")
	_ = h.sources.Parameters.Update(parameters)
	if values(t, h.registry)["uds_native_policies_active"] != 0 {
		t.Fatal("invalid snapshot remained healthy")
	}
	_ = unstructured.SetNestedField(parameters.Object, true, "spec", "valid")
	_ = unstructured.SetNestedField(parameters.Object, "stale-authority", "spec", "revision")
	_ = h.sources.Parameters.Update(parameters)
	if values(t, h.registry)["uds_native_policies_active"] != 0 {
		t.Fatal("stale compiler revision remained healthy")
	}
	_ = unstructured.SetNestedField(parameters.Object, "current-valid", "spec", "revision")
	_ = unstructured.SetNestedField(parameters.Object, true, "spec", "valid")
	_ = h.sources.Parameters.Update(parameters)
	obj, _, _ = h.sources.ValidatingBindings.GetByKey("uds-native-pod-profile")
	_ = h.sources.ValidatingBindings.Delete(obj)
	if values(t, h.registry)["uds_native_policies_active"] != 0 {
		t.Fatal("missing native binding remained healthy")
	}
	binding := obj.(*unstructured.Unstructured).DeepCopy()
	_ = unstructured.SetNestedStringSlice(binding.Object, []string{"Warn"}, "spec", "validationActions")
	_ = h.sources.ValidatingBindings.Add(binding)
	if values(t, h.registry)["uds_native_policies_active"] != 0 {
		t.Fatal("non-enforcing native binding remained healthy")
	}
}

func TestCancelledLeaseContextImmediatelyRevokesReportedAuthority(t *testing.T) {
	h, _, _, _ := healthy(t)
	ctx, cancel := context.WithCancel(context.Background())
	h.Leadership(ctx)
	if values(t, h.registry)["uds_native_reconciliation_ready"] != 1 {
		t.Fatal("live Lease holder missing")
	}
	cancel()
	if values(t, h.registry)["uds_native_reconciliation_ready"] != 0 {
		t.Fatal("cancelled Lease was reported as active while workers drained")
	}
}
