// Various validation actions for Kubernetes resources from Big Bang
import { K8s, Log } from "pepr";
import { processExemptions } from "../operator/controllers/exemptions/exemptions";
import { Matcher, Policy, UDSExemption } from "../operator/crd";
import { policyExemptionMap } from "./common";
import "./networking";
import "./security";
import "./storage";

export { policies } from "./common";

export type StoredMatcher = Matcher & { owner: string };
export type PolicyMap = Map<Policy, StoredMatcher[]>;

export async function startExemptionWatch() {
  // initialize in-memory map
  const policyList = Object.values(Policy);
  for (const p of policyList) {
    policyExemptionMap.set(p, []);
  }

  // only run in admission controller
  if (process.env.PEPR_WATCH_MODE === "false") {
    const watcher = K8s(UDSExemption).Watch(async (exemption, phase) => {
      Log.debug(`Exemption ${exemption.metadata?.name} is ${phase}`);

      processExemptions(exemption, phase, policyExemptionMap);
    });

    // This will run until the process is terminated or the watch is aborted
    await watcher.start();
  }
}
