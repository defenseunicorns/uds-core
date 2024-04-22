import { PeprValidateRequest } from "pepr";
import { MatcherKind, Policy, UDSExemption } from "..";
import { UDSConfig } from "../../../config";

function checkForSlashes(name: string) {
  return name[0] === "/" && name[name.length - 1] === "/";
}

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
  const exemptions = exempt.spec?.exemptions ?? [];

  // Validate exemption namespace is uds-policy-exempts unless allowAllNSExemptions is true
  if (!UDSConfig.allowAllNSExemptions) {
    if (exempt.metadata?.namespace !== validNs) {
      return req.Deny(
        `Invalid namespace "${exempt.metadata?.namespace}" for UDSExemption ${exempt.metadata?.name}: must be "${validNs}"`,
      );
    }
  }

  // Validate there's at least 1 exemption element
  if (exemptions.length === 0) {
    return req.Deny("Invalid number of exemptions: must have at least 1");
  }

  // Validate exemption element policies and matcher kind are compatible
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

  // Validate that each matcher name does not contain leading or trailing slashes and is a valid regex pattern
  for (const e of exemptions) {
    if (checkForSlashes(e.matcher.name)) {
      return req.Deny(
        `Invalid matcher name "${e.matcher.name}": please remove the leading and trailing slashes`,
      );
    }

    try {
      new RegExp(e.matcher.name);
    } catch (err) {
      return req.Deny(`Invalid regular expression pattern ${e.matcher.name}: ${err}`);
    }
  }

  return req.Approve();
}
