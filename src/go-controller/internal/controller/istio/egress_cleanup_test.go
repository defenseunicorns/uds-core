// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package istio

import (
	"context"
	"encoding/json"
	udstypes "github.com/defenseunicorns/uds-core/src/go-controller/api/uds/v1alpha1"
	"testing"

	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	dynamicfake "k8s.io/client-go/dynamic/fake"
	ktesting "k8s.io/client-go/testing"
)

func TestEmptyAmbientEgressCleanupGuardsWaypointVersion(t *testing.T) {
	for _, owned := range []bool{true, false} {
		t.Run(map[bool]string{true: "owned", false: "unrelated"}[owned], func(t *testing.T) {
			gateway := buildEgressWaypointGateway(nil)
			gateway.SetUID("original")
			gateway.SetResourceVersion("12")
			if !owned {
				gateway.SetLabels(map[string]string{"uds/package": "other"})
			}
			client := dynamicfake.NewSimpleDynamicClientWithCustomListKinds(runtime.NewScheme(), map[schema.GroupVersionResource]string{
				gatewayGVR: "GatewayList", serviceEntryGVR: "ServiceEntryList", egressAuthGVR: "AuthorizationPolicyList",
			})
			if _, err := client.Resource(gatewayGVR).Namespace(ambientEgressNS).Create(context.Background(), gateway, metav1.CreateOptions{}); err != nil {
				t.Fatal(err)
			}
			deleted := false
			client.PrependReactor("delete", "gateways", func(action ktesting.Action) (bool, runtime.Object, error) {
				deleted = true
				options := action.(ktesting.DeleteAction).GetDeleteOptions()
				if options.Preconditions == nil || options.Preconditions.UID == nil || *options.Preconditions.UID != "original" || options.Preconditions.ResourceVersion == nil || *options.Preconditions.ResourceVersion != "12" {
					t.Fatalf("missing inspected waypoint identity: %#v", options)
				}
				return true, nil, apierrors.NewConflict(gatewayGVR.GroupResource(), "egress-waypoint", nil)
			})
			err := reconcileAmbientEgress(context.Background(), client, "deleted-package", nil)
			if owned && (!deleted || !apierrors.IsConflict(err)) {
				t.Fatalf("concurrent waypoint change was not retained for retry: deleted=%v err=%v", deleted, err)
			}
			if !owned && (deleted || err != nil) {
				t.Fatalf("unrelated waypoint targeted: deleted=%v err=%v", deleted, err)
			}
			if _, err := client.Resource(gatewayGVR).Namespace(ambientEgressNS).Get(context.Background(), "egress-waypoint", metav1.GetOptions{}); err != nil {
				t.Fatal("gateway lost", err)
			}
		})
	}
}

func TestAdvancedHTTPPreservesCurrentRedirectPrefixRewrite(t *testing.T) {
	var raw = &unstructured.Unstructured{Object: map[string]interface{}{"spec": map[string]interface{}{"network": map[string]interface{}{"expose": []interface{}{map[string]interface{}{"advancedHTTP": map[string]interface{}{"redirect": map[string]interface{}{"prefixRewrite": "/current"}}}}}}}}
	// Decode through the typed Package API, as the informer does in production.
	data, err := json.Marshal(raw.Object)
	if err != nil {
		t.Fatal(err)
	}
	var pkg udstypes.UDSPackage
	if err := json.Unmarshal(data, &pkg); err != nil {
		t.Fatal(err)
	}
	route := map[string]interface{}{"route": "previous"}
	applyAdvancedHTTP(route, pkg.Spec.Network.Expose[0].AdvancedHTTP)
	redirect, ok := route["redirect"].(map[string]interface{})
	if !ok || redirect["prefixRewrite"] != "/current" || route["route"] != nil {
		t.Fatalf("redirect changed during typed reconciliation: %#v", route)
	}
}
