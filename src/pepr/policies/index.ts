/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

// Various validation actions for Kubernetes resources from Big Bang
import { K8s } from "pepr";
import { Component, setupLogger } from "../logger";
import { ExemptionStore } from "../operator/controllers/exemptions/exemption-store";
import { processExemptions } from "../operator/controllers/exemptions/exemptions";
import { registerWatchEventHandlers, watchCfg } from "../operator/controllers/utils";
import { UDSExemption } from "../operator/crd";
import "./istio";
import "./networking";
import "./security";
import "./storage";

// configure subproject logger
const log = setupLogger(Component.POLICIES);

export { policies } from "./common";

export async function startExemptionWatch() {
  ExemptionStore.init();

  // only run in admission controller or dev mode
  if (process.env.PEPR_WATCH_MODE === "false" || process.env.PEPR_MODE === "dev") {
    const watcher = K8s(UDSExemption).Watch(async (exemption, phase) => {
      log.debug(`Processing exemption ${exemption.metadata?.name}, watch phase: ${phase}`);

      processExemptions(exemption, phase);
    }, watchCfg);

    // This will run until the process is terminated or the watch is aborted
    log.debug("Starting exemption watch...");
    registerWatchEventHandlers(watcher, log, "UDSExemption");
    await watcher.start();
  }
}
