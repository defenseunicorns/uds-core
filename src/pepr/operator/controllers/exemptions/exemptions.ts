import { Log } from "pepr";
import { policies } from "../../../policies/index";
import { UDSExemption } from "../../crd";

// Add Exemptions to Pepr store as "policy": "[{matcher}]"
export async function addExemptions(exmpt: UDSExemption) {
  const t0 = performance.now();
  const { Store } = policies;
  if (exmpt.spec && exmpt.spec.exemptions) {
    for (const e of exmpt.spec.exemptions) {
      const name = removeRegexSlash(e.matcher.name);
      for (const p of e.policies) {
        const exemptionList = JSON.parse(Store.getItem(p) || "[]");
        exemptionList.push({ namespace: e.matcher.namespace, name: name });
        await Store.setItemAndWait(p, JSON.stringify(exemptionList));
      }
    }
  }
  const t1 = performance.now();
  Log.debug(`Time to complete exemption write: ${t1 - t0}`);
}

// Remove leading and trailing / if added by user to matcher name
function removeRegexSlash(name: string) {
  if (name[0] === "/" && name[name.length - 1] === "/") {
    name = name.slice(1, name.length - 1);
  }
  return name;
}
