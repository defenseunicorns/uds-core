// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package sso

import (
	"context"
	"testing"

	udstypes "github.com/defenseunicorns/uds-core/src/go-controller/api/uds/v1alpha1"
	"github.com/defenseunicorns/uds-core/src/go-controller/internal/utils"
	corev1 "k8s.io/api/core/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/apimachinery/pkg/types"
	dynamicfake "k8s.io/client-go/dynamic/fake"
	"k8s.io/client-go/kubernetes/fake"
	ktesting "k8s.io/client-go/testing"
)

func TestFailedCollidingClientCannotPurgeAnotherPackageWaypoint(t *testing.T) {
	if utils.WaypointName("foo.bar") != utils.WaypointName("foo-bar") {
		t.Fatal("fixture does not reproduce sanitized client name collision")
	}
	for _, owner := range []types.UID{"original-package", ""} {
		t.Run(string(owner), func(t *testing.T) {
			pkg, client, kube := cleanupFixture(t, owner)
			if err := PurgeAuthserviceWaypoints(context.Background(), client, kube, pkg, pkg.Namespace); err != nil {
				t.Fatal(err)
			}
			if _, err := client.Resource(gatewayGVR).Namespace(pkg.Namespace).Get(context.Background(), utils.WaypointName("foo.bar"), metav1.GetOptions{}); err != nil {
				t.Fatalf("foreign Gateway removed: %v", err)
			}
			pod, _ := kube.CoreV1().Pods(pkg.Namespace).Get(context.Background(), "app", metav1.GetOptions{})
			svc, _ := kube.CoreV1().Services(pkg.Namespace).Get(context.Background(), "app", metav1.GetOptions{})
			if pod.Labels["istio.io/use-waypoint"] == "" || svc.Labels["istio.io/use-waypoint"] == "" || svc.Labels["istio.io/ingress-use-waypoint"] != "true" {
				t.Fatal("foreign routing labels removed")
			}
			for _, action := range client.Actions() {
				if action.GetVerb() == "delete" {
					t.Fatal("foreign Gateway delete reached API")
				}
			}
		})
	}
}

func TestOwnedWaypointCleanupPinsPhysicalIdentityAndVersion(t *testing.T) {
	pkg, client, kube := cleanupFixture(t, "failed-package")
	client.PrependReactor("delete", "gateways", func(action ktesting.Action) (bool, runtime.Object, error) {
		options := action.(ktesting.DeleteAction).GetDeleteOptions()
		if options.Preconditions == nil || options.Preconditions.UID == nil || *options.Preconditions.UID != "gateway-uid" || options.Preconditions.ResourceVersion == nil || *options.Preconditions.ResourceVersion != "4" {
			t.Fatal("cleanup lacks replacement/ownership-change preconditions")
		}
		return false, nil, nil
	})
	if err := PurgeAuthserviceWaypoints(context.Background(), client, kube, pkg, pkg.Namespace); err != nil {
		t.Fatal(err)
	}
	if _, err := client.Resource(gatewayGVR).Namespace(pkg.Namespace).Get(context.Background(), utils.WaypointName("foo-bar"), metav1.GetOptions{}); !apierrors.IsNotFound(err) {
		t.Fatalf("owned Gateway remains: %v", err)
	}
	pod, _ := kube.CoreV1().Pods(pkg.Namespace).Get(context.Background(), "app", metav1.GetOptions{})
	svc, _ := kube.CoreV1().Services(pkg.Namespace).Get(context.Background(), "app", metav1.GetOptions{})
	if pod.Labels["istio.io/use-waypoint"] != "" || svc.Labels["istio.io/use-waypoint"] != "" || svc.Labels["istio.io/ingress-use-waypoint"] != "" {
		t.Fatal("owned routing labels remain")
	}
}

func TestWaypointCleanupPropagatesReplacementConflict(t *testing.T) {
	pkg, client, kube := cleanupFixture(t, "failed-package")
	client.PrependReactor("delete", "gateways", func(ktesting.Action) (bool, runtime.Object, error) {
		return true, nil, apierrors.NewConflict(gatewayGVR.GroupResource(), utils.WaypointName("foo-bar"), nil)
	})
	if err := PurgeAuthserviceWaypoints(context.Background(), client, kube, pkg, pkg.Namespace); !apierrors.IsConflict(err) {
		t.Fatalf("replacement conflict hidden: %v", err)
	}
}

func cleanupFixture(t *testing.T, owner types.UID) (*udstypes.UDSPackage, *dynamicfake.FakeDynamicClient, *fake.Clientset) {
	pkg := &udstypes.UDSPackage{ObjectMeta: metav1.ObjectMeta{Name: "failed", Namespace: "apps", UID: "failed-package"}, Spec: udstypes.Spec{Sso: []udstypes.Sso{{ClientID: "foo-bar", EnableAuthserviceSelector: map[string]string{"app": "demo"}}}}, Status: udstypes.PackageStatus{AuthserviceClients: []udstypes.AuthserviceClient{{ClientID: "foo-bar"}}}}
	name := utils.WaypointName("foo.bar")
	var owners []metav1.OwnerReference
	if owner != "" {
		owners = []metav1.OwnerReference{{APIVersion: "uds.dev/v1alpha1", Kind: "Package", Name: "original", UID: owner}}
	}
	gw := buildWaypointGateway(name, "apps", "failed", "1", owners)
	gw.SetUID("gateway-uid")
	gw.SetResourceVersion("4")
	client := dynamicfake.NewSimpleDynamicClientWithCustomListKinds(runtime.NewScheme(), map[schema.GroupVersionResource]string{gatewayGVR: "GatewayList"})
	if err := client.Tracker().Create(gatewayGVR, gw, "apps"); err != nil {
		t.Fatal(err)
	}
	if _, err := client.Resource(gatewayGVR).Namespace("apps").Get(context.Background(), name, metav1.GetOptions{}); err != nil {
		t.Fatalf("missing cleanup fixture: %v", err)
	}
	kube := fake.NewClientset(&corev1.Pod{ObjectMeta: metav1.ObjectMeta{Name: "app", Namespace: "apps", Labels: map[string]string{"istio.io/use-waypoint": name}}}, &corev1.Service{ObjectMeta: metav1.ObjectMeta{Name: "app", Namespace: "apps", Labels: map[string]string{"istio.io/use-waypoint": name, "istio.io/ingress-use-waypoint": "true"}}})
	return pkg, client, kube
}
