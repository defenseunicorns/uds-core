/**
 * Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { GenericKind, RegisterKind } from "kubernetes-fluent-client";

/**
 * VirtualMachine represents the template for a VM running inside the KubeVirt runtime.
 * This is a minimal registration for admission-time mutation of Istio annotations.
 */
export class VirtualMachine extends GenericKind {
  declare apiVersion?: string;
  declare kind?: string;
  declare metadata?: Record<string, unknown>;
  declare spec?: {
    runStrategy?: string;
    template?: {
      metadata?: {
        labels?: Record<string, string>;
        annotations?: Record<string, string>;
      };
      spec?: Record<string, unknown>;
    };
    dataVolumeTemplates?: unknown[];
    volumeClaimTemplates?: unknown[];
  };
}

RegisterKind(VirtualMachine, {
  group: "kubevirt.io",
  version: "v1",
  kind: "VirtualMachine",
  plural: "virtualmachines",
});
