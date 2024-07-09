// Various validation actions for Kubernetes resources from Big Bang
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
    const watcher = K8s(UDSExemption).Watch(async (exemption, phase) => {
      log.debug(`Processing exemption ${exemption.metadata?.name}, watch phase: ${phase}`);

      processExemptions(exemption, phase);
    });

    // This will run until the process is terminated or the watch is aborted
    log.debug("Starting exemption watch...");
    await watcher.start();
  }
}
