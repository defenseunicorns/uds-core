// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package udspackage

import (
	"fmt"
	udstypes "github.com/defenseunicorns/uds-core/src/go-controller/api/uds/v1alpha1"
	"github.com/defenseunicorns/uds-core/src/go-controller/internal/controller/probes"
	"github.com/defenseunicorns/uds-core/src/go-controller/internal/store"
	"github.com/defenseunicorns/uds-core/src/go-controller/internal/utils"
	"k8s.io/apimachinery/pkg/labels"
	"slices"
	"sort"
)

func desiredSSOClients(pkg *udstypes.UDSPackage) []string {
	ids := probes.DesiredSSOClients(pkg)
	for _, client := range pkg.Spec.Sso {
		ids = append(ids, client.ClientID)
	}
	sort.Strings(ids)
	return slices.Compact(ids)
}

func journalSSOOwnership(pkg *udstypes.UDSPackage) {
	pkg.Status.SsoClients = append(pkg.Status.SsoClients, desiredSSOClients(pkg)...)
	sort.Strings(pkg.Status.SsoClients)
	pkg.Status.SsoClients = slices.Compact(pkg.Status.SsoClients)
	for _, client := range pkg.Spec.Sso {
		if client.EnableAuthserviceSelector == nil {
			continue
		}
		found := false
		for _, old := range pkg.Status.AuthserviceClients {
			if old.ClientID == client.ClientID {
				found = true
			}
		}
		if !found {
			pkg.Status.AuthserviceClients = append(pkg.Status.AuthserviceClients, udstypes.AuthserviceClient{ClientID: client.ClientID, Selector: client.EnableAuthserviceSelector})
		}
	}
}

func (c *PackageController) checkSSOOwnership(pkg *udstypes.UDSPackage) error {
	packages, err := c.packageLister.List(labels.Everything())
	if err != nil {
		return err
	}
	var desired []string
	if c.flags.SSO {
		desired = desiredSSOClients(pkg)
	}
	for _, other := range packages {
		if other.UID == pkg.UID {
			continue
		}
		if other.Namespace == pkg.Namespace && other.DeletionTimestamp == nil && other.Spec.GetServiceMeshMode() != pkg.Spec.GetServiceMeshMode() {
			return fmt.Errorf("namespace %s already uses %s mesh mode in Package %s", pkg.Namespace, other.Spec.GetServiceMeshMode(), other.Name)
		}
		for _, id := range append(desiredSSOClients(other), other.Status.SsoClients...) {
			if slices.Contains(desired, id) {
				return fmt.Errorf("SSO client %q is owned by Package %s/%s", id, other.Namespace, other.Name)
			}
		}
	}
	return nil
}

func (c *PackageController) RequeueNamespace(namespace string) {
	if namespace == "" {
		return
	}
	packages, err := c.packageLister.UDSPackages(namespace).List(labels.Everything())
	if err != nil {
		return
	}
	for _, pkg := range packages {
		c.recovery.invalidate(pkg.UID)
		c.enqueue(pkg)
	}
}
func (c *PackageController) RequeueName(namespace, name string) {
	pkg, err := c.packageLister.UDSPackages(namespace).Get(name)
	if err != nil {
		return
	}
	c.recovery.invalidate(pkg.UID)
	c.enqueue(pkg)
}

func (c *PackageController) syncWaypointStore(pkg *udstypes.UDSPackage) {
	if !c.flags.SSO || !c.flags.IstioInjection || pkg.DeletionTimestamp != nil {
		c.waypointStore.DeleteForPackage(pkg.Namespace, string(pkg.UID))
		return
	}
	// Every serving replica hydrates the same converged topology. Spec updates
	// and Pending/Retrying ownership journals are not successful publications.
	// Retain the prior map until this generation reaches Ready; a fresh replica
	// has no converged entry and selected admission must fail closed until repair.
	if pkg.Status.Phase == nil || *pkg.Status.Phase != udstypes.PhaseReady || pkg.Status.ObservedGeneration == nil || *pkg.Status.ObservedGeneration != pkg.Generation {
		return
	}
	if pkg.Spec.GetServiceMeshMode() != udstypes.Ambient {
		c.waypointStore.DeleteForPackage(pkg.Namespace, string(pkg.UID))
		return
	}
	var entries []store.WaypointEntry
	for _, entry := range pkg.Spec.Sso {
		if entry.EnableAuthserviceSelector != nil {
			entries = append(entries, store.WaypointEntry{Selector: entry.EnableAuthserviceSelector, WaypointName: utils.WaypointName(entry.ClientID)})
		}
	}
	c.waypointStore.SetForPackage(pkg.Namespace, string(pkg.UID), entries)
}
