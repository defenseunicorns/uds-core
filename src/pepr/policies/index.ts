// Various validation actions for Kubernetes resources from Big Bang
import { K8s, Log } from "pepr";
import { initPolicyMap } from "../operator/controllers/exemptions/exemption-store";
import { processExemptions } from "../operator/controllers/exemptions/exemptions";
import { Matcher, Policy, UDSExemption } from "../operator/crd";
import "./networking";
import "./security";
import "./storage";

export { policies } from "./common";

export type StoredMatcher = Matcher & { owner: string };
export type PolicyMap = Map<Policy, StoredMatcher[]>;

export async function startExemptionWatch() {
  initPolicyMap();

  // only run in admission controller
  if (process.env.PEPR_WATCH_MODE === "false") {
    const watcher = K8s(UDSExemption).Watch(async (exemption, phase) => {
      Log.debug(`Processing exemption ${exemption.metadata?.name}, watch phase: ${phase}`);

      processExemptions(exemption, phase);
    });

    // This will run until the process is terminated or the watch is aborted
    await watcher.start();
  }
}
