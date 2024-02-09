import { policies } from "../../../policies/index";
import { UDSExemption } from "../../crd";

export async function addExemptions(exmpt: UDSExemption) {
  const { Store } = policies;
  exmpt.spec?.exemptions?.forEach(e => {
    e.policies.forEach(p => {
      // get list of exemptions or empty array if no exemptions exist yet for this policy
      const exemptionList = JSON.parse(Store.getItem(p) || "[]");
      exemptionList.push({ namespace: e.matcher.namespace, name: e.matcher.name });
      Store.setItem(p, JSON.stringify(exemptionList));
    });
  });
}
