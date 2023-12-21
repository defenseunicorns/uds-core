import { PeprValidateRequest } from "pepr";
import { UDSPackage } from ".";

const invalidNamespaces = ["kube-system", "kube-public", "invalid", "pepr-system"];

export async function validator(req: PeprValidateRequest<UDSPackage>) {
  const ns = req.Raw.metadata?.namespace ?? "invalid";

  if (invalidNamespaces.includes(ns)) {
    return req.Deny("invalid namespace");
  }

  // Ensure the name of each expose is unique
  const expose = req.Raw.spec?.network?.expose ?? [];
  const uniqueNames = new Set(expose.map(e => e.name));
  if (uniqueNames.size !== expose.length) {
    return req.Deny("expose.name must be unique");
  }

  // Ensure the name of each network policy is unique
  const networkPolicy = req.Raw.spec?.network?.policies?.allow ?? [];
  const uniquePolicyNames = new Set(networkPolicy.map(e => e.name));
  if (uniquePolicyNames.size !== networkPolicy.length) {
    return req.Deny("networkPolicy.name must be unique");
  }

  for (const policy of networkPolicy) {
    // remoteGenerated cannot be combined with remoteNamespaceLabels or remotePodLabels
    if (policy.remoteGenerated && (policy.remoteNamespaceLabels || policy.remotePodLabels)) {
      return req.Deny(
        "remoteGenerated cannot be combined with remoteNamespaceLabels or remotePodLabels",
      );
    }
  }

  return req.Approve();
}
