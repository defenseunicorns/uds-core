// Various validation actions for Kubernetes resources from Big Bang
import { K8s } from "pepr";
import { processExemptions } from "../operator/controllers/exemptions/exemptions";
import { Matcher, Policy, UDSExemption } from "../operator/crd";
import "./networking";
import "./security";
import "./storage";

export { policies } from "./common";

export type StoredMatcher = Matcher & { owner: string };
export type PolicyMap = Map<Policy, StoredMatcher[]>;
export const policyExemptionMap: PolicyMap = new Map();

const policyList = Object.values(Policy);
for (const p of policyList) {
  policyExemptionMap.set(p, []);
}

export async function startExemptionWatch() {
  // only run in admission controller
  if (process.env.PEPR_WATCH_MODE === "false") {
    const watcher = K8s(UDSExemption).Watch(async (exemption, phase) => {
      console.log(`Exemption ${exemption.metadata?.name} is ${phase}`);

      processExemptions(exemption, phase, policyExemptionMap);
    });

    // This will run until the process is terminated or the watch is aborted
    await watcher.start();
  }
}
