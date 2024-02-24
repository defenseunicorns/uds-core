import { Log } from "pepr";
import { policies } from "../../../policies/index";
import { Matcher, Policy, UDSExemption } from "../../crd";
import { PeprStore } from "pepr/dist/lib/storage";

type StoredMatchers = Matcher & { owner: string };
type PolicyMap = Map<Policy, StoredMatchers[]>;

// Remove leading and trailing '/' if added by user to matcher name
function removeRegexSlash(name: string) {
  if (name[0] === "/" && name[name.length - 1] === "/") {
    name = name.slice(1, name.length - 1);
  }
  return name;
}

function isAlreadyAdded(matchers: StoredMatchers[], name: string) {
  for (const m of matchers) {
    if (m.name === name) {
      return true;
    }
  }
}

function deleteRemovedPolicy(
  matcherName: string,
  matchers: StoredMatchers[],
  policy: Policy,
  policyMap: PolicyMap,
) {
  for (const m of matchers) {
    if (m.name === matcherName) {
      Log.debug(`Removing ${matcherName} from ${policy}`);
      policyMap.set(
        policy,
        matchers.filter(m => m.name !== matcherName),
      );
    }
  }
}

function deleteRemovedMatchers(
  policyMap: PolicyMap,
  policy: Policy,
  currExemptMatchers: string[],
  ownerId: string,
) {
  const policyMatchers = policyMap.get(policy) || [];

  for (const m of policyMatchers) {
    if (m.owner === ownerId) {
      if (!currExemptMatchers.includes(m.name)) {
        // get again incase matchers were updated on previous iteration
        const updatedPolicyMatchers = policyMap.get(policy) || [];
        policyMap.set(
          policy,
          updatedPolicyMatchers.filter(mp => mp.name !== m.name),
        );
      }
    }
  }
}

function updateStore(policyMap: PolicyMap, exempt: UDSExemption, store: PeprStore) {
  for (const [policy, matchers] of policyMap.entries()) {
    Log.debug(
      `Adding from exemption ${exempt.metadata?.name} to policy ${policy}: ${JSON.stringify(
        matchers,
      )}`,
    );
    store.setItem(policy, JSON.stringify(matchers));
  }
}

// Add Exemptions to Pepr store as "policy": "[{...matcher, owner: uid}]"
//(Performance Optimization) Use local map to do aggregation before updating store
export function processExemptions(exempt: UDSExemption) {
  const { Store } = policies;
  const policyList = Object.values(Policy);
  const exemptions = exempt.spec?.exemptions ?? [];
  const currExemptMatchers: string[] = [];
  const policyMap: PolicyMap = new Map();

  // Iterate through all policies -- important for removing exemptions if CR is updated
  for (const p of policyList) {
    // Set local map with current state of store
    policyMap.set(p, JSON.parse(Store.getItem(p) || "[]"));

    for (const e of exemptions) {
      const name = removeRegexSlash(e.matcher.name);
      if (!currExemptMatchers.includes(name)) {
        currExemptMatchers.push(name);
      }

      const updatedMatchers = policyMap.get(p) ?? [];

      if (e.policies.includes(p)) {
        // Do additional checks if policy already has matchers
        if (updatedMatchers.length > 0) {
          if (isAlreadyAdded(updatedMatchers, name)) {
            continue;
          } else {
            updatedMatchers.push({
              namespace: e.matcher.namespace,
              name: name,
              owner: exempt.metadata?.uid || "",
            });
            policyMap.set(p, updatedMatchers);
          }
        } else {
          // Else add to policy for the first time
          policyMap.set(p, [
            { namespace: e.matcher.namespace, name: name, owner: exempt.metadata?.uid || "" },
          ]);
        }
      } else {
        // check if matcher no longer has this policy from previous CR version
        deleteRemovedPolicy(name, updatedMatchers, p, policyMap);
      }
    }

    //Check if policy should no longer have this matcher from previous CR version
    deleteRemovedMatchers(policyMap, p, currExemptMatchers, exempt.metadata?.uid || "");
  }

  // Iterate through local Map and update Store
  updateStore(policyMap, exempt, Store);
}

//(Performance Optimization) Use local map to do aggregation before updating store
export function removeExemptions(exempt: UDSExemption) {
  const { Store } = policies;
  const exemptions = exempt.spec?.exemptions ?? [];
  Log.debug(`Removing policy exemptions for ${exempt.metadata?.name}`);

  const policyMap: PolicyMap = new Map();

  // Initialize the policy map with current values from the store
  for (const e of exemptions) {
    for (const p of e.policies) {
      const matchers: StoredMatchers[] = JSON.parse(Store.getItem(p) || "[]");
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
