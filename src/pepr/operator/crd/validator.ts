import { PeprValidateRequest } from "pepr";

import { UDSPackage } from ".";

const invalidNamespaces = ["kube-system", "kube-public", "_unknown_", "pepr-system"];

export async function validator(req: PeprValidateRequest<UDSPackage>) {
  const ns = req.Raw.metadata?.namespace ?? "_unknown_";

  if (invalidNamespaces.includes(ns)) {
    return req.Deny("invalid namespace");
  }

  // Ensure the name of each network policy is unique
  const networkPolicy = req.Raw.spec?.network?.allow ?? [];

  for (const policy of networkPolicy) {
    // remoteGenerated cannot be combined with remoteNamespace or remotePodLabels
    if (policy.remoteGenerated && (policy.remoteNamespace || policy.remotePodLabels)) {
      return req.Deny("remoteGenerated cannot be combined with remoteNamespace or remotePodLabels");
    }
  }

  return req.Approve();
}
