// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
package udspackage

import (
	"slices"

	udstypes "github.com/defenseunicorns/uds-core/src/go-controller/api/uds/v1alpha1"
	"k8s.io/apimachinery/pkg/labels"
	"k8s.io/apimachinery/pkg/types"
)

// RequeueSSOClients repairs only owners of changed shared Authservice chains.
// Journals retain authority through failed updates and finalization.
func (c *PackageController) RequeueSSOClients(ids []string) {
	c.requeueMatching(func(pkg *udstypes.UDSPackage) bool {
		for _, id := range append(desiredSSOClients(pkg), pkg.Status.SsoClients...) {
			if slices.Contains(ids, id) {
				return true
			}
		}
		for _, client := range pkg.Status.AuthserviceClients {
			if slices.Contains(ids, client.ClientID) {
				return true
			}
		}
		return false
	})
}

func (c *PackageController) RequeueUIDs(uids []types.UID) {
	c.requeueMatching(func(pkg *udstypes.UDSPackage) bool { return slices.Contains(uids, pkg.UID) })
}

func (c *PackageController) requeueMatching(matches func(*udstypes.UDSPackage) bool) {
	packages, err := c.packageLister.List(labels.Everything())
	if err != nil {
		c.logger.Error("list Packages for shared dependency recovery", "error", err)
		return
	}
	for _, pkg := range packages {
		if matches(pkg) {
			c.recovery.invalidate(pkg.UID)
			c.enqueue(pkg)
		}
	}
}
