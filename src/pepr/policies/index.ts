// Various validation actions for Kubernetes resources from Big Bang
import { WatchCfg } from "kubernetes-fluent-client";
import { K8s } from "pepr";
import { Component, setupLogger } from "../logger";
import { ExemptionStore } from "../operator/controllers/exemptions/exemption-store";
import { processExemptions } from "../operator/controllers/exemptions/exemptions";
import { Matcher, Policy, UDSExemption } from "../operator/crd";
import "./networking";
import "./security";
import "./storage";

// configure subproject logger
const log = setupLogger(Component.POLICIES);

export { policies } from "./common";

export type StoredMatcher = Matcher & { owner: string };
export type PolicyMap = Map<Policy, StoredMatcher[]>;

export async function startExemptionWatch() {
  ExemptionStore.init();

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
    const watcher = K8s(UDSExemption).Watch(async (exemption, phase) => {
      log.debug(`Processing exemption ${exemption.metadata?.name}, watch phase: ${phase}`);

      processExemptions(exemption, phase);
    }, watchCfg);

    // This will run until the process is terminated or the watch is aborted
    log.debug("Starting exemption watch...");
    await watcher.start();
  }
}
