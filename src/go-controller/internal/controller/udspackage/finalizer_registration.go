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

const packageFinalizer = "pepr.dev/finalizer"

// The historical marker remains compatible with existing Packages. Persist it
// before creating external identity clients or other non-GC resources.
func (c *PackageController) ensureFinalizer(ctx context.Context, pkg *udsv1alpha1.UDSPackage) error {
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
