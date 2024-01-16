import { PeprValidateRequest } from "pepr";

import { UDSPackage } from ".";
import { generateName } from "../controllers/network/generate";
import { sanitizeResourceName } from "../controllers/utils";

const invalidNamespaces = ["kube-system", "kube-public", "_unknown_", "pepr-system"];

export async function validator(req: PeprValidateRequest<UDSPackage>) {
  const ns = req.Raw.metadata?.namespace ?? "_unknown_";

  if (invalidNamespaces.includes(ns)) {
    return req.Deny("invalid namespace");
  }

  const networkPolicy = req.Raw.spec?.network?.allow ?? [];

  // Track the names of the network policies to ensure they are unique
  const networkPolicyNames = new Set<string>();

  for (const policy of networkPolicy) {
    // remoteGenerated cannot be combined with remoteNamespace or remotePodLabels
    if (policy.remoteGenerated && (policy.remoteNamespace || policy.remotePodLabels)) {
      return req.Deny("remoteGenerated cannot be combined with remoteNamespace or remotePodLabels");
    }

    // Ensure the policy name is unique
    const name = sanitizeResourceName(`allow-${req.Raw.metadata?.name}-${generateName(policy)}`);
    if (networkPolicyNames.has(name)) {
      return req.Deny(
        `The combination of characteristics of this network allow rule would create a duplicate NetworkPolicy. ` +
          `Verify you do not have duplicate allow rules, or add a unique "description" field for this rule. ` +
          `The duplicate rule would be named "${name}".`,
      );
    }
    // Add the name to the set to track it
    networkPolicyNames.add(name);
  }

  return req.Approve();
}
