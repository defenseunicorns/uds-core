// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
package udspackage

import (
	"context"
	"slices"
	"testing"

	udstypes "github.com/defenseunicorns/uds-core/src/go-controller/api/uds/v1alpha1"
	"github.com/defenseunicorns/uds-core/src/go-controller/internal/featureflags"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	ktesting "k8s.io/client-go/testing"
	"k8s.io/utils/ptr"
)

func controlPlanePackage() *udstypes.UDSPackage {
	return &udstypes.UDSPackage{ObjectMeta: metav1.ObjectMeta{
		Name: "uds-controller", Namespace: "uds-system", UID: "core-owner", ResourceVersion: "10",
		Labels:      map[string]string{"app.kubernetes.io/managed-by": "Helm"},
		Annotations: map[string]string{"meta.helm.sh/release-name": "uds-controller", "meta.helm.sh/release-namespace": "uds-system"},
	}}
}

func TestHelmOwnedCoreDoesNotDependOnItsOwnFinalizer(t *testing.T) {
	for _, deleting := range []bool{false, true} {
		pkg := controlPlanePackage()
		pkg.Finalizers = []string{packageFinalizer, "another-owner"}
		if deleting {
			now := metav1.Now()
			pkg.DeletionTimestamp = &now
		}
		ctrl, uds, kube := fixtureController(t, pkg, featureflags.Flags{SSO: true, IstioInjection: true})
		uds.PrependReactor("update", "packages", func(action ktesting.Action) (bool, runtime.Object, error) {
			value := action.(ktesting.UpdateAction).GetObject().(*udstypes.UDSPackage)
			if value.UID != pkg.UID || value.ResourceVersion != "10" {
				t.Fatal("control-plane lifecycle release lost identity preconditions")
			}
			return false, nil, nil
		})
		var err error
		if deleting {
			err = ctrl.handleFinalizer(context.Background(), pkg.DeepCopy())
		} else {
			err = ctrl.ensureFinalizer(context.Background(), pkg.DeepCopy())
		}
		got, readErr := uds.UdsV1alpha1().UDSPackages(pkg.Namespace).Get(context.Background(), pkg.Name, metav1.GetOptions{})
		if err != nil || readErr != nil || !slices.Equal(got.Finalizers, []string{"another-owner"}) || len(kube.Actions()) != 0 {
			t.Fatal("Core self teardown depended on unavailable runtime cleanup", err, readErr, got, kube.Actions())
		}
	}
}

func TestFreshHelmOwnedCoreDoesNotRegisterACircularFinalizer(t *testing.T) {
	pkg := controlPlanePackage()
	ctrl, uds, _ := fixtureController(t, pkg, featureflags.Flags{})
	if err := ctrl.ensureFinalizer(context.Background(), pkg); err != nil {
		t.Fatal(err)
	}
	if len(pkg.Finalizers) != 0 || len(uds.Actions()) != 0 {
		t.Fatal("Core created a finalizer dependency on its own process", pkg.Finalizers, uds.Actions())
	}
}

func TestCoreLifecycleExceptionCannotSkipApplicationOrExternalCleanup(t *testing.T) {
	changes := []func(*udstypes.UDSPackage){
		func(p *udstypes.UDSPackage) { p.Namespace = "application" },
		func(p *udstypes.UDSPackage) { p.Name = "application" },
		func(p *udstypes.UDSPackage) { p.Labels["app.kubernetes.io/managed-by"] = "another" },
		func(p *udstypes.UDSPackage) { p.Annotations["meta.helm.sh/release-name"] = "another" },
		func(p *udstypes.UDSPackage) { p.Annotations["meta.helm.sh/release-namespace"] = "another" },
		func(p *udstypes.UDSPackage) { p.Spec.Sso = []udstypes.Sso{{ClientID: "external"}} },
		func(p *udstypes.UDSPackage) {
			p.Spec.Network = &udstypes.Network{Expose: []udstypes.Expose{{Host: ptr.To("external")}}}
		},
		func(p *udstypes.UDSPackage) {
			p.Spec.Network = &udstypes.Network{Allow: []udstypes.Allow{{RemoteHost: ptr.To("external.example")}}}
		},
		func(p *udstypes.UDSPackage) { p.Status.SsoClients = []string{"historical"} },
		func(p *udstypes.UDSPackage) {
			p.Status.AuthserviceClients = []udstypes.AuthserviceClient{{ClientID: "historical"}}
		},
		func(p *udstypes.UDSPackage) { p.Status.Endpoints = []string{"historical.example"} },
		func(p *udstypes.UDSPackage) { p.Finalizers = []string{legacyPackageFinalizer} },
	}
	for _, change := range changes {
		pkg := controlPlanePackage()
		change(pkg)
		ctrl, uds, _ := fixtureController(t, pkg, featureflags.Flags{})
		if err := ctrl.ensureFinalizer(context.Background(), pkg.DeepCopy()); err != nil {
			t.Fatal(err)
		}
		got, _ := uds.UdsV1alpha1().UDSPackages(pkg.Namespace).Get(context.Background(), pkg.Name, metav1.GetOptions{})
		if !slices.Contains(got.Finalizers, packageFinalizer) {
			t.Fatal("application/external state escaped ordinary finalization", pkg)
		}
	}
}
