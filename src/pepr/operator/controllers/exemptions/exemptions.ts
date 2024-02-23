import { Log } from "pepr";
import { policies } from "../../../policies/index";
import { Matcher, Policy, UDSExemption } from "../../crd";

type PolicyExemptions = Matcher & {owner: string}

// Remove leading and trailing '/' if added by user to matcher name
function removeRegexSlash(name: string) {
  if (name[0] === "/" && name[name.length - 1] === "/") {
    name = name.slice(1, name.length - 1);
  }
  return name;
}

function isAlreadyAdded(matchers: PolicyExemptions[], name: string) {
  for (const m of matchers) {
    if (m.name === name) {
      return true;
    }
  }
}

// Add Exemptions to Pepr store as "policy": "[{owner: uid, ...matcher}]"
export function processExemptions(exempt: UDSExemption) {
  const { Store } = policies;
  const policyList = Object.values(Policy);
  const exemptions = exempt.spec?.exemptions ?? [];

  // Store list of current matcher names from this Exemption
  const exemptMatchers = [];

  // Use local map for matchers aggregation before writing to store
  const exemptionMap = new Map<Policy, PolicyExemptions[]>();

  // Iterate through all policies -- important for removing exemptions if CR is updated
  for (const p of policyList) {
    // Set local map with current state of store
    exemptionMap.set(p, JSON.parse(Store.getItem(p) || "[]"));

    for (const e of exemptions) {
      const name = removeRegexSlash(e.matcher.name);
      
      exemptMatchers.push(name)

      //get updated matchers every loop iteration
      const matchers = exemptionMap.get(p) ?? [];

      if (e.policies.includes(p)) {
        // Do additional checks if policy already has matchers
        if (matchers.length > 0) {
          if (isAlreadyAdded(matchers, name)) {
            continue;
          } else {
            Log.debug(`Adding from exemption ${exempt.metadata?.name}, ${name}, to ${p}`)
            matchers.push({ namespace: e.matcher.namespace, name: name, owner: exempt.metadata?.uid! });
            exemptionMap.set(p, matchers);
          }
        } else {
          // Else add to policy for the first time
          Log.debug(`Adding from exemption ${exempt.metadata?.name}, ${name}, to ${p}`);  
          exemptionMap.set(p, [{ namespace: e.matcher.namespace, name: name, owner: exempt.metadata?.uid! }]);
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

    // Look through matchers of each policy and determine if the matcher no longer exists in updated version of CR
    const updatedPolicyMatchers = exemptionMap.get(p) ?? [];    
    for (const m of updatedPolicyMatchers) {
      // if m.name not found in exemptionBlocks and owner ref is same then remove
      if(m.owner === exempt.metadata?.uid)  {
        if(!exemptMatchers.includes(m.name)) {
          const filteredList = updatedPolicyMatchers.filter(mp => mp.name !== m.name);
          exemptionMap.set(p, filteredList);
        }
      }
    }
  }



  // Iterate through local Map and update Store
  for (const [policy, matchers] of exemptionMap.entries()) {
    Log.debug(`Adding from exemption ${exempt.metadata?.name} to policy ${policy}: ${JSON.stringify(matchers)}`);
    Store.setItem(policy, JSON.stringify(matchers));
  }
}

export function removeExemptions(exempt: UDSExemption) {
  const { Store } = policies;
  const exemptions = exempt.spec?.exemptions ?? [];
  Log.debug(`Removing policy exemptions for ${exempt.metadata?.name}`);

  const policyMap: Map<string, Matcher[]> = new Map();

  // Initialize the policy map with current values from the store
  for (const e of exemptions) {
    for (const p of e.policies) {
      const matchers: Matcher[] = JSON.parse(Store.getItem(p) || "[]");
      policyMap.set(p, matchers);
    }
  }

  // Loop through exemptions and remove matchers from policies in the local map
  for (const e of exemptions) {
    const name = removeRegexSlash(e.matcher.name);
    for (const p of e.policies) {
      const matchers = policyMap.get(p) || [];
      const filteredList = matchers.filter(m => m.name !== name);
      policyMap.set(p, filteredList);
    }
  }

  // Loop through the local map and update the store with new values
  for (const [policyId, matchers] of policyMap.entries()) {
    Store.setItem(policyId, JSON.stringify(matchers));
  }
}