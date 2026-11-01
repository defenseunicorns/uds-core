// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package udspackage

import (
	"context"
	"fmt"
	udsv1alpha1 "github.com/defenseunicorns/uds-core/src/go-controller/api/uds/v1alpha1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"slices"
)

const packageFinalizer = "uds.dev/finalizer"
const legacyPackageFinalizer = "pepr.dev/finalizer"

// Persist Core ownership before creating external side effects. Legacy markers
// are also honored during deletion so existing Packages need no application migration.
func (c *PackageController) ensureFinalizer(ctx context.Context, pkg *udsv1alpha1.UDSPackage) error {
	if helmOwnedControlPlanePackage(pkg) {
		return c.releaseControlPlaneFinalizer(ctx, pkg)
	}
	if slices.Contains(pkg.Finalizers, packageFinalizer) {
		return nil
	}
	copy := pkg.DeepCopy()
	copy.Finalizers = append(copy.Finalizers, packageFinalizer)
	updated, err := c.udsClient.UDSPackages(pkg.Namespace).Update(ctx, copy, metav1.UpdateOptions{})
	if err != nil {
		return fmt.Errorf("register package finalizer before side effects: %w", err)
	}
	*pkg = *updated
	return nil
}

// Helm owns the control plane's teardown, and its generated namespaced objects
// have Package owner references. It cannot wait on the process Helm is removing.
func helmOwnedControlPlanePackage(pkg *udsv1alpha1.UDSPackage) bool {
	for _, allow := range pkg.Spec.GetAllow() {
		if allow.RemoteHost != nil && *allow.RemoteHost != "" {
			return false
		}
	}
	return pkg.Namespace == "uds-system" && pkg.Name == "uds-controller" &&
		pkg.Labels["app.kubernetes.io/managed-by"] == "Helm" &&
		pkg.Annotations["meta.helm.sh/release-name"] == "uds-controller" &&
		pkg.Annotations["meta.helm.sh/release-namespace"] == "uds-system" &&
		!slices.Contains(pkg.Finalizers, legacyPackageFinalizer) &&
		len(pkg.Spec.Sso) == 0 && len(pkg.Spec.GetExpose()) == 0 &&
		len(pkg.Status.SsoClients) == 0 && len(pkg.Status.AuthserviceClients) == 0 && len(pkg.Status.Endpoints) == 0
}

func (c *PackageController) releaseControlPlaneFinalizer(ctx context.Context, pkg *udsv1alpha1.UDSPackage) error {
	if !slices.Contains(pkg.Finalizers, packageFinalizer) {
		return nil
	}
	copy := pkg.DeepCopy()
	copy.Finalizers = removeFinalizer(copy.Finalizers, packageFinalizer)
	updated, err := c.udsClient.UDSPackages(pkg.Namespace).Update(ctx, copy, metav1.UpdateOptions{})
	if err != nil {
		return fmt.Errorf("release Helm-owned control-plane lifecycle: %w", err)
	}
	*pkg = *updated
	return nil
}
