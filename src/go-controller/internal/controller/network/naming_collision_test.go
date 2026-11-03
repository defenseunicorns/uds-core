// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
package network

import (
	"context"
	"encoding/json"
	"reflect"
	"strings"
	"testing"

	udstypes "github.com/defenseunicorns/uds-core/src/go-controller/api/uds/v1alpha1"
	"github.com/defenseunicorns/uds-core/src/go-controller/internal/utils"
	networkingv1 "k8s.io/api/networking/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/client-go/kubernetes/fake"
	ktesting "k8s.io/client-go/testing"
	"k8s.io/utils/ptr"
)

func numericExposePackage() *udstypes.UDSPackage {
	return &udstypes.UDSPackage{ObjectMeta: metav1.ObjectMeta{Name: "test-tenant-app", Namespace: "apps", UID: "pkg", Generation: 1}, Spec: udstypes.Spec{Network: &udstypes.Network{Expose: []udstypes.Expose{
		{Host: ptr.To("demo-8080"), Gateway: ptr.To("tenant"), Port: ptr.To(float64(8080)), Selector: map[string]string{"app": "test-tenant-app"}},
		{Host: ptr.To("demo-8081"), Gateway: ptr.To("tenant"), Port: ptr.To(float64(8081)), Selector: map[string]string{"app": "test-tenant-app"}},
	}}}}
}

func TestNumericExposeAndMonitorNamesMatchDirectionBeforeSanitize(t *testing.T) {
	pkg := numericExposePackage()
	for index, port := range []int{8080, 8081} {
		policy := generateExposePolicy("apps", pkg.Spec.GetExpose()[index], pkg, udstypes.Ambient)
		name := utils.SanitizeResourceName("allow-" + pkg.Name + "-" + policy.Name)
		want := "allow-test-tenant-app-ingress-" + []string{"8080", "8081"}[index] + "-test-tenant-app-istio-tenant-gateway"
		if name != want || int(policy.Spec.Ingress[0].Ports[0].Port.IntVal) != port {
			t.Fatalf("port identity lost: %s != %s", name, want)
		}
	}
	first := generateMonitorPolicy("apps", udstypes.Monitor{TargetPort: 9090, Selector: map[string]string{"app": "same"}}, pkg, udstypes.Ambient)
	second := generateMonitorPolicy("apps", udstypes.Monitor{TargetPort: 9091, Selector: map[string]string{"app": "same"}}, pkg, udstypes.Ambient)
	if first.Name == second.Name {
		t.Fatal("monitor ports overwrite the same policy")
	}
}

func TestNumericExposePoliciesConvergeWithoutSpecFlipAndCleanOldAliases(t *testing.T) {
	ctx := context.Background()
	pkg := numericExposePackage()
	legacy := &networkingv1.NetworkPolicy{ObjectMeta: metav1.ObjectMeta{Name: "allow-test-tenant-app-test-tenant-app-istio-tenant-gateway", Namespace: "apps", UID: "legacy", ResourceVersion: "1", Labels: map[string]string{"uds/package": pkg.Name, "uds/generation": utils.PkgGeneration(pkg)}, OwnerReferences: utils.GetOwnerRef(pkg)}}
	foreign := legacy.DeepCopy()
	foreign.Name, foreign.UID, foreign.OwnerReferences[0].UID = "foreign", "foreign", "another-package"
	client := fake.NewClientset(legacy, foreign)
	changes := 0
	client.PrependReactor("patch", "networkpolicies", func(action ktesting.Action) (bool, runtime.Object, error) {
		patch := action.(ktesting.PatchAction)
		var desired networkingv1.NetworkPolicy
		if err := json.Unmarshal(patch.GetPatch(), &desired); err != nil {
			t.Fatal(err)
		}
		current, err := client.Tracker().Get(networkingv1.SchemeGroupVersion.WithResource("networkpolicies"), "apps", desired.Name)
		if err != nil {
			desired.UID = types.UID("resource-" + desired.Name)
			changes++
			return true, &desired, client.Tracker().Add(&desired)
		}
		prior := current.(*networkingv1.NetworkPolicy)
		if !reflect.DeepEqual(prior.Spec, desired.Spec) || !reflect.DeepEqual(prior.Labels, desired.Labels) || !reflect.DeepEqual(prior.Annotations, desired.Annotations) {
			changes++
		}
		desired.UID = prior.UID
		return true, &desired, client.Tracker().Update(networkingv1.SchemeGroupVersion.WithResource("networkpolicies"), &desired, "apps")
	})
	for round := 0; round < 3; round++ {
		if round == 2 {
			pkg.Spec.Network.Expose[0], pkg.Spec.Network.Expose[1] = pkg.Spec.Network.Expose[1], pkg.Spec.Network.Expose[0]
		}
		before := changes
		if _, err := Reconcile(ctx, client.NetworkingV1(), pkg, "apps", udstypes.Ambient); err != nil {
			t.Fatal(err)
		}
		if round > 0 && changes != before {
			t.Fatal("unchanged/reordered exposures generated self-write drift")
		}
	}
	if _, err := client.NetworkingV1().NetworkPolicies("apps").Get(ctx, foreign.Name, metav1.GetOptions{}); err != nil {
		t.Fatal("matching discovery labels removed another Package resource")
	}
	pkg.Spec.Network.Expose = pkg.Spec.Network.Expose[:1]
	if _, err := Reconcile(ctx, client.NetworkingV1(), pkg, "apps", udstypes.Ambient); err != nil {
		t.Fatal(err)
	}
	list, _ := client.NetworkingV1().NetworkPolicies("apps").List(ctx, metav1.ListOptions{})
	ports := map[int32]bool{}
	for _, policy := range list.Items {
		if strings.Contains(policy.Annotations["uds/description"], "Istio tenant gateway") && len(policy.Spec.Ingress) > 0 && len(policy.Spec.Ingress[0].Ports) > 0 {
			ports[policy.Spec.Ingress[0].Ports[0].Port.IntVal] = true
		}
	}
	if len(ports) != 1 {
		t.Fatalf("removed exposure left a live policy alias: %v", ports)
	}
}
