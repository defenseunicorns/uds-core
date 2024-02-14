import { PeprValidateRequest } from "pepr";

import { UDSExemption } from ".";

export async function exmptValidator(req: PeprValidateRequest<UDSExemption>) {
  const exemptions = req.Raw.spec?.exemptions ?? [];
  if (exemptions.length === 0) {
    return req.Deny("Invalid number of exemptions: must have at least 1");
  }

  // Check that each matcher name is valid regex
  for (const e of exemptions) {
    try {
      new RegExp(e.matcher.name);
    } catch (err) {
      return req.Deny(`Invalid regular expression pattern for ${e.matcher.name}: ${err}`);
    }
  }

  return req.Approve();
}
