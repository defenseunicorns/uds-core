import { PeprValidateRequest } from "pepr";

import { MatcherKind, Policy, UDSExemption } from "..";
import { UDSConfig } from "../../../config";

const validNs = "uds-policy-exemptions";
const kindToPolicyMap = new Map<MatcherKind, Policy[]>([
  [
    MatcherKind.Pod,
    Object.values(Policy).filter(
      p => p != Policy.DisallowNodePortServices && p != Policy.RestrictExternalNames,
    ),
  ],
  [MatcherKind.Service, [Policy.RestrictExternalNames, Policy.DisallowNodePortServices]],
]);

export async function exemptValidator(req: PeprValidateRequest<UDSExemption>) {
  const exempt = req.Raw;

  if (!UDSConfig.allowAllNSExemptions) {
    if (exempt.metadata?.namespace !== validNs) {
      return req.Deny(
        `Invalid namespace "${exempt.metadata?.namespace}" for UDSExemption ${exempt.metadata?.name}: must be "${validNs}"`,
      );
    }
  }

  const exemptions = exempt.spec?.exemptions ?? [];
  if (exemptions.length === 0) {
    return req.Deny("Invalid number of exemptions: must have at least 1");
  }

  for (const e of exemptions) {
    const policies = kindToPolicyMap.get(e.matcher.kind!)!;
    for (const p of e.policies) {
      if (!policies.includes(p)) {
        const validKind =
          e.matcher.kind === MatcherKind.Pod ? MatcherKind.Service : MatcherKind.Pod;
        return req.Deny(
          `Invalid kind "${e.matcher.kind}" for matcher "${e.matcher.name}" with policy "${p}": "${p}" can only be exempted for kind "${validKind}"`,
        );
      }
    }
  }

  // Check that each matcher name is valid regex
  for (const e of exemptions) {
    try {
      new RegExp(e.matcher.name);
    } catch (err) {
      return req.Deny(`Invalid regular expression pattern ${e.matcher.name}: ${err}`);
    }
  }

  return req.Approve();
}
