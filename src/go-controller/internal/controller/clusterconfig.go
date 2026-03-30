// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

package controller

import (
	"context"
	"encoding/json"
	"log/slog"

	udscfg "github.com/defenseunicorns/uds-core/src/go-controller/internal/config"

	udstypes "github.com/defenseunicorns/uds-core/src/go-controller/api/uds/v1alpha1"
)

// ClusterConfigController handles reconciliation of the UDS ClusterConfig resource.
// It populates the in-memory config used by other controllers (e.g. PackageController).
type ClusterConfigController struct {
	logger *slog.Logger
}

// NewClusterConfigController creates a new ClusterConfigController.
func NewClusterConfigController() *ClusterConfigController {
	return &ClusterConfigController{
		logger: slog.Default(),
	}
}

// Reconcile loads the ClusterConfig into the in-memory config and logs the result.
// It mirrors the handleCfg / shouldSkip logic in
// src/pepr/operator/controllers/config/config.ts.
func (c *ClusterConfigController) Reconcile(ctx context.Context, cfg *udstypes.ClusterConfig) error {
	// Skip guard — mirrors Pepr's shouldSkip():
	// 1. Phase == Pending: guards against infinite loop when status is patched to Pending
	// 2. observedGeneration == generation: this generation was already processed
	if cfg.Status.Phase != nil && *cfg.Status.Phase == udstypes.ConfigPhasePending {
		c.logger.Debug("Skipping ClusterConfig reconcile: phase is Pending",
			"name", cfg.Name, "generation", cfg.Generation)
		return nil
	}
	if cfg.Status.ObservedGeneration != nil && cfg.Generation == *cfg.Status.ObservedGeneration {
		c.logger.Debug("Skipping ClusterConfig reconcile: generation already processed",
			"name", cfg.Name, "generation", cfg.Generation)
		return nil
	}

	udscfg.Update(func(c *udscfg.Config) {
		c.Domain = cfg.Spec.Expose.Domain
		if cfg.Spec.Expose.AdminDomain != nil {
			c.AdminDomain = *cfg.Spec.Expose.AdminDomain
		} else {
			c.AdminDomain = "admin." + cfg.Spec.Expose.Domain
		}

		c.AllowAllNSExemptions = cfg.Spec.Policy.AllowAllNsExemptions

		if cfg.Spec.Networking != nil {
			c.KubeApiCIDR = derefString(cfg.Spec.Networking.KubeApiCIDR)
			c.KubeNodeCIDRs = cfg.Spec.Networking.KubeNodeCIDRs
		}

		if cfg.Spec.CABundle != nil {
			c.CABundle.Certs = derefString(cfg.Spec.CABundle.Certs)
			c.CABundle.IncludeDoDCerts = derefBool(cfg.Spec.CABundle.IncludeDoDCerts)
			c.CABundle.IncludePublicCerts = derefBool(cfg.Spec.CABundle.IncludePublicCerts)
		}
	})

	loaded := udscfg.Get()
	c.logger.Info("Loaded UDS Config",
		"domain", loaded.Domain,
		"adminDomain", loaded.AdminDomain,
		"allowAllNSExemptions", loaded.AllowAllNSExemptions,
		"kubeApiCIDR", loaded.KubeApiCIDR,
		"kubeNodeCIDRs", loaded.KubeNodeCIDRs,
	)

	// TODO: patch ClusterConfig status to Ready (and Failed on error) once the dynamic
	// client is wired into controllers.

	return nil
}

// HandleAdd is called when a ClusterConfig is created.
func (c *ClusterConfigController) HandleAdd(obj interface{}) {
	cfg, ok := parseClusterConfig(obj)
	if !ok {
		return
	}
	if err := c.Reconcile(context.Background(), cfg); err != nil {
		c.logger.Error("Failed to reconcile ClusterConfig on add", "error", err, "name", cfg.Name)
	}
}

// HandleUpdate is called when a ClusterConfig is updated.
func (c *ClusterConfigController) HandleUpdate(_, newObj interface{}) {
	cfg, ok := parseClusterConfig(newObj)
	if !ok {
		return
	}
	if err := c.Reconcile(context.Background(), cfg); err != nil {
		c.logger.Error("Failed to reconcile ClusterConfig on update", "error", err, "name", cfg.Name)
	}
}

// HandleDelete is intentionally omitted — ClusterConfig deletion is not expected or handled.
// This matches Pepr's startConfigWatch, which only handles Added and Modified phases.

// parseClusterConfig converts an informer object to a typed ClusterConfig via JSON marshaling.
func parseClusterConfig(obj interface{}) (*udstypes.ClusterConfig, bool) {
	marshaler, ok := obj.(json.Marshaler)
	if !ok {
		return nil, false
	}
	raw, err := marshaler.MarshalJSON()
	if err != nil {
		slog.Error("Failed to marshal ClusterConfig object", "error", err)
		return nil, false
	}
	var cfg udstypes.ClusterConfig
	if err := json.Unmarshal(raw, &cfg); err != nil {
		slog.Error("Failed to unmarshal ClusterConfig object", "error", err)
		return nil, false
	}
	return &cfg, true
}

func derefString(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

func derefBool(b *bool) bool {
	if b == nil {
		return false
	}
	return *b
}
