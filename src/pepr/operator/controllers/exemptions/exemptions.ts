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

function isAlreadyAdded(matchers: Matcher[], name: string) {
  for (const m of matchers) {
    if (m.name === name) {
      return true;
    }
  }
}

// Add Exemptions to Pepr store as "policy": "[{matcher}]"
export function processExemptions(exempt: UDSExemption) {
  const { Store } = policies;
  const policyList = Object.values(Policy);
  const exemptions = exempt.spec?.exemptions ?? [];

  // Use local map for matchers aggregation before writing to store
  const exemptionMap = new Map<Policy, Matcher[]>();

  // Iterate through all policies -- important for removing exemptions if CR is updated
  for (const p of policyList) {
    // Set local map with current state of store
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
}

// Remove Exemptions when CR is deleted; Using setItemAndAwait() to avoid using local map if speed is not as important
export async function removeExemptions(exempt: UDSExemption) {
  const { Store } = policies;
  const exemptions = exempt.spec?.exemptions ?? [];

  for (const e of exemptions) {
    const name = removeRegexSlash(e.matcher.name);
    for (const p of e.policies) {
      const matchers: Matcher[] = JSON.parse(Store.getItem(p) || "[]");
      const filteredList = matchers.filter(m => m.name !== name);
      await Store.setItemAndWait(p, JSON.stringify(filteredList));
    }
  }
}
