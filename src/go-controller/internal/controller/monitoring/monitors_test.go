// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
package monitoring

import (
	"context"
	"encoding/json"
	udstypes "github.com/defenseunicorns/uds-core/src/go-controller/api/uds/v1alpha1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/dynamic/fake"
	ktesting "k8s.io/client-go/testing"
	"k8s.io/utils/ptr"
	"testing"
)

func TestMonitorKeepsOptionalCredentialsAndExplicitPodSelector(t *testing.T) {
	client := fake.NewSimpleDynamicClientWithCustomListKinds(runtime.NewScheme(), map[schema.GroupVersionResource]string{podMonitorGVR: "PodMonitorList"})
	var applied *unstructured.Unstructured
	client.PrependReactor("patch", "podmonitors", func(action ktesting.Action) (bool, runtime.Object, error) {
		object := &unstructured.Unstructured{}
		if err := json.Unmarshal(action.(ktesting.PatchAction).GetPatch(), &object.Object); err != nil {
			t.Fatal(err)
		}
		applied = object
		return true, object, nil
	})
	monitor := udstypes.Monitor{Kind: ptr.To(udstypes.PodMonitor), PortName: "metrics", Selector: map[string]string{"app": "service"}, PodSelector: map[string]string{}, Authorization: &udstypes.Authorization{Credentials: udstypes.Credentials{Name: ptr.To("credentials"), Key: "token", Optional: ptr.To(true)}}}
	pkg := &udstypes.UDSPackage{ObjectMeta: metav1.ObjectMeta{Name: "app", Namespace: "apps", UID: "package", Generation: 1}, Spec: udstypes.Spec{Monitor: []udstypes.Monitor{monitor}}}
	if _, err := ReconcilePodMonitors(context.Background(), client, pkg, "apps"); err != nil {
		t.Fatal(err)
	}
	labels, _, _ := unstructured.NestedStringMap(applied.Object, "spec", "selector", "matchLabels")
	if len(labels) != 0 {
		t.Fatal("explicit namespace selector was replaced by Service selector")
	}
	endpoints, _, _ := unstructured.NestedSlice(applied.Object, "spec", "podMetricsEndpoints")
	credentials := endpoints[0].(map[string]interface{})["authorization"].(map[string]interface{})["credentials"].(map[string]interface{})
	if credentials["optional"] != true || credentials["name"] != "credentials" {
		t.Fatalf("credential contract lost: %v", credentials)
	}
	fallback, _, _ := unstructured.NestedString(applied.Object, "spec", "fallbackScrapeProtocol")
	if fallback != "PrometheusText0.0.4" {
		t.Fatal(fallback)
	}
}
