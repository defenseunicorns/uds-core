import { policies } from "../../../policies/index";
import { UDSExemption } from "../../crd";

// Add Exemptions to Pepr store as "policy": "[{matcher}]"
export async function addExemptions(exmpt: UDSExemption) {
  const { Store } = policies;
  exmpt.spec?.exemptions?.forEach(e => {
    const name = removeRegexSlash(e.matcher.name);
    e.policies.forEach(p => {
      // get list of exemptions or empty array if no exemptions exist yet for this policy
      const exemptionList = JSON.parse(Store.getItem(p) || "[]");
      exemptionList.push({ namespace: e.matcher.namespace, name: name });
      Store.setItem(p, JSON.stringify(exemptionList));
    });
  });
}

// Remove leading and trailing / if added by user to matcher name
function removeRegexSlash(name: string) {
  if (name[0] === "/" && name[name.length - 1] === "/") {
    name = name.slice(1, name.length - 1);
  }
  return name;
}
