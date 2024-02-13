import { Log } from "pepr";
import { policies } from "../../../policies/index";
import { Matcher, Policy, UDSExemption } from "../../crd";

// Remove leading and trailing '/' if added by user to matcher name
function removeRegexSlash(name: string) {
  if (name[0] === "/" && name[name.length - 1] === "/") {
    name = name.slice(1, name.length - 1);
  }
  return name;
}

// *** Using setItemAndWait() ***

// Add Exemptions to Pepr store as "policy": "[{matcher}]"
// export async function addExemptions(exmpt: UDSExemption) {
//   const t0 = performance.now();
//   const { Store } = policies;
//   if (exmpt.spec && exmpt.spec.exemptions) {
//     for (const e of exmpt.spec.exemptions) {
//       const name = removeRegexSlash(e.matcher.name);
//       for (const p of e.policies) {
//         const exemptionList = JSON.parse(Store.getItem(p) || "[]");
//         exemptionList.push({ namespace: e.matcher.namespace, name: name });
//         await Store.setItemAndWait(p, JSON.stringify(exemptionList));
//       }
//     }
//   }
//   const t1 = performance.now();
//   Log.debug(`Time to complete exemption write: ${t1 - t0}`);
// }

// *** Use Local Map to then Update Store ***
// Add Exemptions to Pepr store as "policy": "[{matcher}]"
export async function addExemptions(exmpt: UDSExemption) {
  const t0 = performance.now();
  const { Store } = policies;

  // Aggregate matchers for each policy into local Map
  const exemptionMap = new Map<Policy, Matcher[]>();
  exmpt.spec?.exemptions?.forEach(e => {
    const name = removeRegexSlash(e.matcher.name);
    e.policies.forEach(p => {
      const exmptList = exemptionMap.get(p) || [];
      exmptList.push({ namespace: e.matcher.namespace, name: name });
      exemptionMap.set(p, exmptList);
    });
  });

  // Iterate through local Map and update Store
  for (const [k, v] of exemptionMap.entries()) {
    const exemptionList: Matcher[] = JSON.parse(Store.getItem(k) || "[]");

    // Iterate though each policy's array of matchers and push each matcher to list for Store
    v.forEach(matcher => {
      exemptionList.push(matcher);
    });

    Store.setItem(k, JSON.stringify(exemptionList));
  }

  const t1 = performance.now();
  Log.debug(`Time to complete exemption write: ${t1 - t0}`);
}

export async function removeExemptions(exmpt: UDSExemption) {
  const { Store } = policies;

  if (exmpt.spec && exmpt.spec.exemptions) {
    for (const e of exmpt.spec.exemptions) {
      const name = removeRegexSlash(e.matcher.name);
      for (const p of e.policies) {
        const exemptionList: Matcher[] = JSON.parse(Store.getItem(p) || "[]");
        //filter matchers, returning those that do not match current exemption.matcher.name
        const filteredList = exemptionList.filter(m => m.name !== name);
        await Store.setItemAndWait(p, JSON.stringify(filteredList));
      }
    }
  }
}
