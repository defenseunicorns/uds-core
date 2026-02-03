/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { Component, setupLogger } from "../../../../logger";

// Central Ambient egress identifiers:
export const ambientEgressNamespace = "istio-egress-ambient";
export const sharedEgressPkgId = "shared-ambient-egress-resource";

// Sidecar Egress Gateway Namespace
export const sidecarEgressNamespace = "istio-egress-gateway";
export const sidecarSharedEgressPkgId = "shared-egress-resource";

// Get the shared annotation key for the package
export function getSharedAnnotationKey(pkgId: string) {
  return `uds.dev/user-${pkgId}`;
}

// Get the unique package ID
export function getPackageId(pkg: { metadata?: { name?: string; namespace?: string } }) {
  return `${pkg.metadata?.name}-${pkg.metadata?.namespace}`;
}

// Export ambient shared egress pkg ID for service-entry usage
export const ambientSharedEgressPkgId = sharedEgressPkgId;

// Shared logger for Istio controllers
export const log = setupLogger(Component.OPERATOR_ISTIO);
