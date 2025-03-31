/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { WatchPhase } from "kubernetes-fluent-client/dist/fluent/types";
import { UDSPackage } from "../../crd";
import { PackageStore } from "./package-store";

/**
 * Processes exemptions based on the watch phase.
 * This function determines how to handle a UDSPackage based on whether it has been added, modified, or deleted
 * during a watch operation.  It uses a switch statement to execute the appropriate logic
 * based on the provided WatchPhase.
 *
 * @param {UDSPackage} pkg - The UDSPackage to process.  UDSPackage is assumed to be a defined type/interface
 *                           representing a package of exemptions.
 * @param {WatchPhase} phase - The phase of the watch operation (Added, Modified, or Deleted).
 *                             WatchPhase is assumed to be an enum or a set of constant values.
 * @returns {void} This function does not return a value; it performs actions based on the input.
 */
export function processPackages(pkg: UDSPackage, phase: WatchPhase) {
  switch (phase) {
    case WatchPhase.Added:
    case WatchPhase.Modified:
        PackageStore.add(pkg);
      break;

    case WatchPhase.Deleted:
        PackageStore.remove(pkg);
      break;
  }
}
