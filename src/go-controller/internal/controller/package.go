// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package controller

import (
	"context"
	"encoding/json"
	"log/slog"

	"k8s.io/client-go/tools/cache"

	udstypes "github.com/defenseunicorns/uds-core/src/go-controller/api/uds/v1alpha1"
)

// PackageController handles reconciliation of UDS Package resources.
type PackageController struct {
	logger *slog.Logger
}

// NewPackageController creates a new PackageController.
func NewPackageController() *PackageController {
	return &PackageController{
		logger: slog.Default(),
	}
}

// Reconcile is called for every add and update event. It should bring the
// cluster state into alignment with the desired state declared in pkg.
func (c *PackageController) Reconcile(ctx context.Context, pkg *udstypes.Package) error {
	c.logger.Info("Reconciling package",
		"namespace", pkg.Namespace,
		"name", pkg.Name,
		"phase", pkg.Status.Phase,
	)

	// TODO: implement reconciliation logic (network policies, SSO, monitors, etc.)

	return nil
}

// HandleAdd is called when a Package is created.
func (c *PackageController) HandleAdd(obj interface{}) {
	pkg, ok := parsePackage(obj)
	if !ok {
		return
	}
	if err := c.Reconcile(context.Background(), pkg); err != nil {
		c.logger.Error("Failed to reconcile package on add", "error", err,
			"namespace", pkg.Namespace, "name", pkg.Name)
	}
}

// HandleUpdate is called when a Package is updated.
func (c *PackageController) HandleUpdate(_, newObj interface{}) {
	pkg, ok := parsePackage(newObj)
	if !ok {
		return
	}
	if err := c.Reconcile(context.Background(), pkg); err != nil {
		c.logger.Error("Failed to reconcile package on update", "error", err,
			"namespace", pkg.Namespace, "name", pkg.Name)
	}
}

// HandleDelete is called when a Package is deleted. Unlike add/update, deletion
// requires cleanup of owned resources rather than reconciliation to desired state.
func (c *PackageController) HandleDelete(obj interface{}) {
	pkg, ok := parsePackage(obj)
	if !ok {
		// obj may be a cache.DeletedFinalStateUnknown tombstone — try to extract it
		tombstone, ok := obj.(cache.DeletedFinalStateUnknown)
		if !ok {
			c.logger.Error("Could not decode deleted package object")
			return
		}
		pkg, ok = parsePackage(tombstone.Obj)
		if !ok {
			return
		}
	}

	c.logger.Info("Package deleted",
		"namespace", pkg.Namespace,
		"name", pkg.Name,
	)

	// TODO: clean up owned resources (network policies, virtual services, SSO clients, etc.)
}

// parsePackage converts an informer object to a typed Package by marshaling through JSON.
// Returns false if the object cannot be converted (e.g. wrong type).
func parsePackage(obj interface{}) (*udstypes.Package, bool) {
	marshaler, ok := obj.(json.Marshaler)
	if !ok {
		return nil, false
	}
	raw, err := marshaler.MarshalJSON()
	if err != nil {
		slog.Error("Failed to marshal package object", "error", err)
		return nil, false
	}
	var pkg udstypes.Package
	if err := json.Unmarshal(raw, &pkg); err != nil {
		slog.Error("Failed to unmarshal package object", "error", err)
		return nil, false
	}
	return &pkg, true
}
