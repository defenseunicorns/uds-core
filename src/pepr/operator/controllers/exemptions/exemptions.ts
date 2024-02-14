import { Log } from "pepr";
import { policies } from "../../../policies/index";
import { Matcher, Policy, UDSExemption } from "../../crd";

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

// Remove leading and trailing '/' if added by user to matcher name
function removeRegexSlash(name: string) {
  if (name[0] === "/" && name[name.length - 1] === "/") {
    name = name.slice(1, name.length - 1);
  }
  return name;
}

function isAlreadyAdded(matchers: Matcher[], name: string) {
  for (const m of matchers) {
    if (m.name === name) {
      return true;
    }
  }
}

const policyList = Object.values(Policy);

// *** Use Local Map to then Update Store ***
// Add Exemptions to Pepr store as "policy": "[{matcher}]"
export async function processExemptions(exmpt: UDSExemption) {
  const t0 = performance.now();
  const { Store } = policies;

  // Aggregate matchers for each policy into local Map
  const exemptionMap = new Map<Policy, Matcher[]>();
  const exemptions = exmpt.spec?.exemptions ?? [];

  // Iterate through all policies -- important for removing exemptions if CR is updated
  for (const p of policyList) {
    exemptionMap.set(p, JSON.parse(Store.getItem(p) || "[]"));

    for (const e of exemptions) {
      const matchers = exemptionMap.get(p) ?? [];
      const name = removeRegexSlash(e.matcher.name);

      if (e.policies.includes(p)) {
        // Do additional checks if policy already has matchers
        if (matchers.length > 0) {
          if (isAlreadyAdded(matchers, name)) {
            continue;
          } else {
            matchers.push({ namespace: e.matcher.namespace, name: name });
            exemptionMap.set(p, matchers);
          }
        } else {
          // Else add to policy for the first time
          exemptionMap.set(p, [{ namespace: e.matcher.namespace, name: name }]);
        }
      } else {
        // check if policy has this matcher from previous version of CR
        for (const m of matchers) {
          if (m.name === name) {
            Log.debug(`Removing ${name} from ${p}`);
            exemptionMap.set(
              p,
              matchers.filter(m => m.name !== name),
            );
          }
        }
      }
    }
  }

  // Iterate through local Map and update Store
  for (const [k, v] of exemptionMap.entries()) {
    Log.debug(`Adding to policy ${k}: ${JSON.stringify(v)}`);
    Store.setItem(k, JSON.stringify(v));
  }

  const t1 = performance.now();
  Log.debug(`Time to complete exemption write: ${t1 - t0}`);
}

export async function removeExemptions(exmpt: UDSExemption) {
  const { Store } = policies;
  const exemptions = exmpt.spec?.exemptions ?? [];

  for (const e of exemptions) {
    const name = removeRegexSlash(e.matcher.name);
    for (const p of e.policies) {
      const matchers: Matcher[] = JSON.parse(Store.getItem(p) || "[]");
      const filteredList = matchers.filter(m => m.name !== name);
      await Store.setItemAndWait(p, JSON.stringify(filteredList));
    }
  }
}
