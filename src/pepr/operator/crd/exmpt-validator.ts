import { PeprValidateRequest } from "pepr";

import { UDSExemption } from ".";

const validNS = "uds-policy-exemptions";

export async function validator(req: PeprValidateRequest<UDSExemption>) {
  const exmpt = req.Raw;
  const ns = exmpt.metadata?.namespace;

  if (ns !== validNS) {
    return req.Deny(`Invalid namespace ${ns}; must be ${validNS}`);
  }

  exmpt.spec?.exemptions?.forEach(e => {
    try {
      new RegExp(e.matcher.name);
    } catch (err) {
      req.Deny(`Invalid regular expression pattern for ${e.matcher.name}: ${err}`);
    }
  });

  return req.Approve();
}
