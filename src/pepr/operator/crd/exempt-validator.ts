import { PeprValidateRequest } from "pepr";

import { UDSExemption } from ".";
import { UDSConfig } from "../../config";

const validNs = "uds-policy-exemptions";

export async function exemptValidator(req: PeprValidateRequest<UDSExemption>) {
  const exempt = req.Raw;

  if (!UDSConfig.allowAllNSExemptions) {
    if (exempt.metadata?.namespace !== validNs) {
      return req.Deny(`Invalid namespace "${exempt.metadata?.namespace}" for UDSExemption ${exempt.metadata?.name}: must be "${validNs}"`);
    }
  }

  const exemptions = exempt.spec?.exemptions ?? [];
  if (exemptions.length === 0) {
    return req.Deny("Invalid number of exemptions: must have at least 1");
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
