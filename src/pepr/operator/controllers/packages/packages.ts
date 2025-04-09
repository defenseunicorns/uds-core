/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { WatchCfg } from "kubernetes-fluent-client";
import { WatchPhase } from "kubernetes-fluent-client/dist/fluent/types";
import { K8s } from "pepr";
import { Component, setupLogger } from "../../../logger";
import { UDSPackage } from "../../crd";
import { PackageStore } from "./package-store";
/**
 * Processes exemptions based on the watch phase.
 * This function determines how to handle a UDSPackage based on whether it has been added or deleted
 * during a watch operation.  It uses a switch statement to execute the appropriate logic
 * based on the provided WatchPhase.
 *
 * @param {UDSPackage} pkg - The UDSPackage to process.  UDSPackage is assumed to be a defined type/interface
 *                           representing a package of exemptions.
 * @param {WatchPhase} phase - The phase of the watch operation (Added or Deleted).
 *                             WatchPhase is assumed to be an enum or a set of constant values.
 * @returns {void} This function does not return a value; it performs actions based on the input.
 */

// configure subproject logger
const log = setupLogger(Component.OPERATOR_RECONCILERS);
export async function startPackageWatch() {
  PackageStore.init();
  // only run in admission controller or dev mode
  if (process.env.PEPR_WATCH_MODE === "false" || process.env.PEPR_MODE === "dev") {
    const watchCfg: WatchCfg = {
      resyncFailureMax: process.env.PEPR_RESYNC_FAILURE_MAX
        ? parseInt(process.env.PEPR_RESYNC_FAILURE_MAX, 10)
        : 5,
      resyncDelaySec: process.env.PEPR_RESYNC_DELAY_SECONDS
        ? parseInt(process.env.PEPR_RESYNC_DELAY_SECONDS, 10)
        : 5,
      lastSeenLimitSeconds: process.env.PEPR_LAST_SEEN_LIMIT_SECONDS
        ? parseInt(process.env.PEPR_LAST_SEEN_LIMIT_SECONDS, 10)
        : 300,
      relistIntervalSec: process.env.PEPR_RELIST_INTERVAL_SECONDS
        ? parseInt(process.env.PEPR_RELIST_INTERVAL_SECONDS, 10)
        : 1800,
    };
    const watcher = K8s(UDSPackage).Watch(async (pkg, phase) => {
      log.debug(`Processing package ${pkg.metadata?.name}, watch phase: ${phase}`);

      processPackages(pkg, phase);
    }, watchCfg);
    // This will run until the process is terminated or the watch is aborted
    log.debug("Starting package watch...");
    await watcher.start();
  }
}

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
