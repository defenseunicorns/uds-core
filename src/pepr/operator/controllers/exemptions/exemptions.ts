import { Log } from "pepr";
import { policies } from "../../../policies/index";
import { ExemptionElement, Matcher, Policy, UDSExemption } from "../../crd";

type StoredMatcher = Matcher & { owner: string };
type PolicyMap = Map<Policy, StoredMatcher[]>;

// Remove leading and trailing '/' if added by user to matcher name
function removeRegexSlash(name: string) {
  if (name[0] === "/" && name[name.length - 1] === "/") {
    name = name.slice(1, name.length - 1);
  }
  return name;
}

function addIfIncludesPolicy(
  policy: Policy,
  policyMap: PolicyMap,
  exemption: ExemptionElement,
  ownerId: string,
  matcherName: string,
  storedMatchers: StoredMatcher[],
) {
  const matcherToStore = {
    namespace: exemption.matcher.namespace,
    name: matcherName,
    owner: ownerId,
  };

  const isDuplicate = storedMatchers.some(m => {
    return (
      m.name === matcherToStore.name &&
      m.namespace === matcherToStore.namespace &&
      m.owner === matcherToStore.owner
    );
  });

  // add if not already added to policy's exemption list
  if (exemption.policies.includes(policy) && !isDuplicate) {
    policyMap.set(policy, [...storedMatchers, matcherToStore]);
  }
}

// Delete a matcher from a policy if the policy has been removed from its policy list
function deleteIfPolicyRemoved(
  policy: Policy,
  policyMap: PolicyMap,
  matcherPolicies: Policy[],
  matcherName: string,
  ownerId: string,
  storedMatchers: StoredMatcher[],
) {
  if (storedMatchers.some(sm => sm.name === matcherName) && !matcherPolicies.includes(policy)) {
    policyMap.set(
      policy,
      storedMatchers.filter(sm => {
        if (sm.name !== matcherName || (sm.name === matcherName && sm.owner !== ownerId)) return sm;
      }),
    );
    Log.debug(`Removing ${matcherName} from ${policy}`);
  }
}

// Delete matchers from the store if they no longer exist on a UDSExemption
function deleteIfMatchersRemoved(
  policyMap: PolicyMap,
  policy: Policy,
  currExemptMatchers: Set<string>,
  ownerId: string,
) {
  const policyMatchers = policyMap.get(policy) || [];

  for (const m of policyMatchers) {
    if (m.owner === ownerId && !currExemptMatchers.has(m.name)) {
      // get again incase matchers were updated on previous iteration
      const updatedPolicyMatchers = policyMap.get(policy) || [];
      policyMap.set(
        policy,
        updatedPolicyMatchers.filter(pm => pm.name !== m.name),
      );
      Log.debug(`Removing ${m.name} from ${policy}`);
    }
  }
}

// Iterate through local Map and update Store
function updateStore(policyMap: PolicyMap) {
  const { Store } = policies;
  for (const [policy, matchers] of policyMap.entries()) {
    Log.debug(`Updating uds policy ${policy} exemptions: ${JSON.stringify(matchers)}`);
    Store.setItem(policy, JSON.stringify(matchers));
  }
}


function setupPolicyMap() {
  const { Store } = policies;
  const policyMap: PolicyMap = new Map();
  const policyList = Object.values(Policy);
  
  for (const p of policyList) {
    policyMap.set(p, JSON.parse(Store.getItem(p) || "[]"));
  }
  
  return {policyMap, policyList};
}

// Add Exemptions to Pepr store as "policy": "[{...matcher, owner: uid}]"
//(Performance Optimization) Use local map to do aggregation before updating store
export function processExemptions(exempt: UDSExemption) {
  const {policyMap, policyList} = setupPolicyMap();
  const currExemptMatchers: Set<string> = new Set();
  const ownerId = exempt.metadata?.uid || ""

  // Iterate through all policies -- important for removing exemptions if CR is updated
  for (const p of policyList) {
    for (const e of exempt.spec?.exemptions ?? []) {
      const name = removeRegexSlash(e.matcher.name);
      const updatedMatchers = policyMap.get(p) ?? [];
      currExemptMatchers.add(name);

      // Check if matcher no longer has this policy from previous CR version
      deleteIfPolicyRemoved(
        p,
        policyMap,
        e.policies,
        name,
        ownerId,
        updatedMatchers,
      );

      // Add if exemption has this policy in its list
      addIfIncludesPolicy(p, policyMap, e, ownerId, name, updatedMatchers);
    }

    // Check if policy should no longer have this matcher from previous CR version
    deleteIfMatchersRemoved(policyMap, p, currExemptMatchers, ownerId);
  }

  updateStore(policyMap);
}

//(Performance Optimization) Use local map to do aggregation before updating store
export function removeExemptions(exempt: UDSExemption) {
  const { policyMap } = setupPolicyMap();

  Log.debug(`Removing policy exemptions for ${exempt.metadata?.name}`);

  // Loop through exemptions and remove matchers from policies in the local map
  for (const e of exempt.spec?.exemptions ?? []) {
    const name = removeRegexSlash(e.matcher.name);
    for (const p of e.policies) {
      const matchers = policyMap.get(p) || [];
      const filteredList = matchers.filter(m => {
        if (m.name !== name || (m.name === name && m.owner !== exempt.metadata?.uid)) return m;
      });
      policyMap.set(p, filteredList);
    }
  }

  updateStore(policyMap);
}
