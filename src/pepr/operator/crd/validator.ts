import { PeprValidateRequest } from "pepr";

import { Gateway, UDSPackage } from ".";
import { generateName } from "../controllers/network/generate";
import { sanitizeResourceName } from "../controllers/utils";
import { generateVSName } from "../controllers/istio/virtual-service";

const invalidNamespaces = ["kube-system", "kube-public", "_unknown_", "pepr-system"];

export async function validator(req: PeprValidateRequest<UDSPackage>) {
  const ns = req.Raw.metadata?.namespace ?? "_unknown_";

  if (invalidNamespaces.includes(ns)) {
    return req.Deny("invalid namespace");
  }

  const exposeList = req.Raw.spec?.network?.expose ?? [];

  // Track the names of the virtual services to ensure they are unique
  const virtualServiceNames = new Set<string>();

  for (const expose of exposeList) {
    if (expose.gateway === Gateway.Passthrough) {
      // This is an HTTPMatch rule, not TLSMatchAttribute
      // https://istio.io/latest/docs/reference/config/networking/virtual-service/#HTTPMatchRequest
      if (expose.match) {
        return req.Deny("match cannot be used with passthrough gateway");
      }
    }

    // Ensure the service name is unique
    const name = generateVSName(req.Raw, expose);
    if (virtualServiceNames.has(name)) {
      return req.Deny(
        `The combination of characteristics of this expose entry would create a duplicate VirtualService. ` +
          `Verify you do not have duplicate values, or add a unique "description" field for this rule. ` +
          `The duplicate rule would be named "${name}".`,
      );
    }

    // Add the name to the set to track it
    virtualServiceNames.add(name);
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
