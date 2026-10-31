// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
package istio

import (
	"context"
	"encoding/json"
	"errors"
	"reflect"
	"strings"
	"testing"

	udstypes "github.com/defenseunicorns/uds-core/src/go-controller/api/uds/v1alpha1"
	"github.com/defenseunicorns/uds-core/src/go-controller/internal/utils"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/apimachinery/pkg/types"
	dynamicfake "k8s.io/client-go/dynamic/fake"
	ktesting "k8s.io/client-go/testing"
	"k8s.io/utils/ptr"
)

func numericIngressPackage() *udstypes.UDSPackage {
	return &udstypes.UDSPackage{ObjectMeta: metav1.ObjectMeta{Name: "test-tenant-app", Namespace: "apps", UID: "pkg", Generation: 1}, Spec: udstypes.Spec{Network: &udstypes.Network{Expose: []udstypes.Expose{
		{Host: ptr.To("demo-8080"), Gateway: ptr.To("tenant"), Service: ptr.To("app"), Port: ptr.To(float64(8080))},
		{Host: ptr.To("demo-8081"), Gateway: ptr.To("tenant"), Service: ptr.To("app"), Port: ptr.To(float64(8081))},
	}}}}
}

func TestIngressNamesPreserveFullDNSIdentity(t *testing.T) {
	for _, hosts := range [][2]string{{"demo-8080.uds.dev", "demo-8081.uds.dev"}, {"a.b.uds.dev", "a-b.uds.dev"}, {strings.Repeat("a", 260) + "x", strings.Repeat("a", 260) + "y"}} {
		one, two := ingressServiceEntryName("pkg", "tenant", hosts[0]), ingressServiceEntryName("pkg", "tenant", hosts[1])
		if one == two || len(one) > 250 || len(two) > 250 || one != ingressServiceEntryName("pkg", "tenant", hosts[0]) {
			t.Fatalf("DNS identities collapse or vary: %s / %s", one, two)
		}
	}
}

func TestNumericIngressEntriesConvergeReorderRemoveAndRetireOwnedLegacyAlias(t *testing.T) {
	ctx := context.Background()
	pkg := numericIngressPackage()
	legacy := buildIngressServiceEntry(pkg.Spec.GetExpose()[0], pkg.Name, pkg.Namespace, utils.PkgGeneration(pkg), utils.GetOwnerRef(pkg), "demo-8080.uds.dev")
	legacy.SetName(legacyIngressServiceEntryName(pkg.Spec.GetExpose()[0], pkg.Name))
	legacy.SetUID("legacy-resource")
	legacy.SetResourceVersion("7")
	foreign := legacy.DeepCopy()
	foreign.SetName("foreign")
	foreign.SetUID("foreign-resource")
	owners := foreign.GetOwnerReferences()
	owners[0].UID = "other-package"
	foreign.SetOwnerReferences(owners)
	client := dynamicfake.NewSimpleDynamicClientWithCustomListKinds(runtime.NewScheme(), map[schema.GroupVersionResource]string{serviceEntryGVR: "ServiceEntryList", virtualServiceGVR: "VirtualServiceList"}, legacy, foreign)
	changes := 0
	client.PrependReactor("patch", "*", func(action ktesting.Action) (bool, runtime.Object, error) {
		patch := action.(ktesting.PatchAction)
		var desired unstructured.Unstructured
		if err := json.Unmarshal(patch.GetPatch(), &desired.Object); err != nil {
			t.Fatal(err)
		}
		current, err := client.Tracker().Get(action.GetResource(), "apps", desired.GetName())
		if err != nil {
			desired.SetUID(types.UID("resource-" + desired.GetName()))
			changes++
			return true, &desired, client.Tracker().Add(&desired)
		}
		prior := current.(*unstructured.Unstructured)
		if !reflect.DeepEqual(prior.Object["spec"], desired.Object["spec"]) || !reflect.DeepEqual(prior.GetLabels(), desired.GetLabels()) {
			changes++
		}
		desired.SetUID(prior.GetUID())
		return true, &desired, client.Tracker().Update(action.GetResource(), &desired, "apps")
	})
	client.PrependReactor("delete", "serviceentries", func(action ktesting.Action) (bool, runtime.Object, error) {
		if action.(ktesting.DeleteAction).GetName() == legacy.GetName() {
			pre := action.(ktesting.DeleteAction).GetDeleteOptions().Preconditions
			if pre == nil || pre.UID == nil || *pre.UID != legacy.GetUID() || pre.ResourceVersion == nil || *pre.ResourceVersion != "7" {
				t.Fatal("legacy alias removal lacks physical UID/version guards")
			}
		}
		return false, nil, nil
	})
	for round := 0; round < 3; round++ {
		if round == 2 {
			pkg.Spec.Network.Expose[0], pkg.Spec.Network.Expose[1] = pkg.Spec.Network.Expose[1], pkg.Spec.Network.Expose[0]
		}
		before := changes
		if _, err := ReconcileIngress(ctx, client, pkg, "apps"); err != nil {
			t.Fatal(err)
		}
		if round > 0 && changes != before {
			t.Fatal("unchanged/reordered exposures produced self-write drift")
		}
	}
	list, _ := client.Resource(serviceEntryGVR).Namespace("apps").List(ctx, metav1.ListOptions{})
	if len(list.Items) != 3 { // Two distinct owned routes plus the ignored foreign resource.
		t.Fatalf("distinct exposure routes or foreign ownership lost: %d entries", len(list.Items))
	}
	pkg.Spec.Network.Expose = pkg.Spec.Network.Expose[:1]
	if _, err := ReconcileIngress(ctx, client, pkg, "apps"); err != nil {
		t.Fatal(err)
	}
	list, _ = client.Resource(serviceEntryGVR).Namespace("apps").List(ctx, metav1.ListOptions{})
	if len(list.Items) != 2 {
		t.Fatal("removed exposure retained an owned routing alias")
	}
}

func TestIngressAliasCleanupCannotHideUIDVersionConflict(t *testing.T) {
	pkg := numericIngressPackage()
	legacy := buildIngressServiceEntry(pkg.Spec.GetExpose()[0], pkg.Name, "apps", "1", utils.GetOwnerRef(pkg), "demo-8080.uds.dev")
	legacy.SetName(legacyIngressServiceEntryName(pkg.Spec.GetExpose()[0], pkg.Name))
	client := dynamicfake.NewSimpleDynamicClientWithCustomListKinds(runtime.NewScheme(), map[schema.GroupVersionResource]string{serviceEntryGVR: "ServiceEntryList"}, legacy)
	failure := errors.New("object replaced during alias retirement")
	client.PrependReactor("delete", "serviceentries", func(ktesting.Action) (bool, runtime.Object, error) { return true, nil, failure })
	if err := purgeIngressServiceEntryAliases(context.Background(), client, pkg, nil, map[string]bool{legacy.GetName(): true}); !errors.Is(err, failure) {
		t.Fatalf("alias retirement failure hidden: %v", err)
	}
}
