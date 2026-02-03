/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { WatchPhase } from "kubernetes-fluent-client/dist/fluent/shared-types.js";
import { UDSExemption } from "../../crd/index.js";
import { ExemptionStore } from "./exemption-store.js";

// Handle adding, updating, and deleting exemptions from Policymap
export function processExemptions(exemption: UDSExemption, phase: WatchPhase) {
  switch (phase) {
    case WatchPhase.Added:
    case WatchPhase.Modified:
      ExemptionStore.add(exemption);
      break;

    case WatchPhase.Deleted:
      ExemptionStore.remove(exemption);
      break;
  }
}
