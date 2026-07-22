/**
 * Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { GenericKind, RegisterKind } from "kubernetes-fluent-client";

/**
 * Minimal Package GenericKind for reading kubevirt enablement.
 * uds-vm owns the kubevirt.enabled contract on this resource.
 */
export class Package extends GenericKind {
  declare metadata?: { name?: string; namespace?: string; deletionTimestamp?: Date };
  declare spec?: {
    kubevirt?: { enabled?: boolean };
  };
}

RegisterKind(Package, {
  group: "uds.dev",
  version: "v1alpha1",
  kind: "Package",
  plural: "packages",
});
