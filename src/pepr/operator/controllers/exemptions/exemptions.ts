import { Log } from "pepr";
import { policies } from "../../../policies/index";
import { ExemptionElement, Matcher, Policy, UDSExemption } from "../../crd";

type StoredMatcher = Matcher & { owner: string };
type PolicyMap = Map<Policy, StoredMatcher[]>;

const isSame = (a: StoredMatcher, b: StoredMatcher) => {
  return (
    a.name === b.name && a.namespace === b.namespace && a.kind == b.kind && a.owner === b.owner
  );
};

function addIfIncludesPolicy(
  policy: Policy,
  policyMap: PolicyMap,
  exemptionEl: ExemptionElement,
  ownerId: string,
) {
  const storedMatchers = policyMap.get(policy) ?? [];
  const matcherToStore = {
    ...exemptionEl.matcher,
    owner: ownerId,
  };
  const isDuplicate = storedMatchers.some(sm => isSame(sm, matcherToStore));

  // add if not already added to policy's exemption list
  if (exemptionEl.policies.includes(policy) && !isDuplicate) {
    policyMap.set(policy, [...storedMatchers, matcherToStore]);
  }
}

// Delete a matcher from a policy if the policy has been removed from its policy list
function deleteIfPolicyRemoved(
  policy: Policy,
  policyMap: PolicyMap,
  exemptionEl: ExemptionElement,
  ownerId: string,
) {
  const matcher = {
    ...exemptionEl.matcher,
    owner: ownerId,
  };
  const storedMatchers = policyMap.get(policy) ?? [];

  if (storedMatchers.some(sm => isSame(sm, matcher)) && !exemptionEl.policies.includes(policy)) {
    policyMap.set(
      policy,
      storedMatchers.filter(sm => {
        if (!isSame(sm, matcher)) return sm;
      }),
    );
    Log.debug(`Removing ${matcher.name} from ${policy}`);
  }
}

// Delete matchers from the store if they no longer exist on a UDSExemption
function deleteIfMatchersRemoved(
  policy: Policy,
  policyMap: PolicyMap,
  currExemptMatchers: StoredMatcher[],
  ownerId: string,
) {
  const policyMatchers = policyMap.get(policy) || [];

  // Check stored matchers that have same owner ref as current UDSExemption
  for (const pm of policyMatchers.filter(m => m.owner === ownerId)) {
    let shouldBeRemoved = true;

    // check if stored matcher exists in current list of UDSExemption matchers
    for (const m of currExemptMatchers) {
      if (isSame(pm, m)) {
        shouldBeRemoved = false;
      }
    }

    if (shouldBeRemoved) {
      // get again incase matchers were updated on previous iteration
      const updatedPolicyMatchers = policyMap.get(policy) || [];
      policyMap.set(
        policy,
        updatedPolicyMatchers.filter(sm => {
          if (!isSame(sm, pm)) return sm;
        }),
      );

      Log.debug(`Removing ${pm.name} from ${policy}`);
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

  return { policyMap, policyList };
}

// Add Exemptions to Pepr store as "policy": "[{...matcher, owner: uid}]"
//(Performance Optimization) Use local map to do aggregation before updating store
export function processExemptions(exempt: UDSExemption) {
  const { policyMap, policyList } = setupPolicyMap();
  const currExemptMatchers: StoredMatcher[] = [];
  const ownerId = exempt.metadata?.uid || "";

  // Iterate through all policies -- important for removing exemptions if CR is updated
  for (const p of policyList) {
    for (const e of exempt.spec?.exemptions ?? []) {
      currExemptMatchers.push({
        ...e.matcher,
        owner: ownerId,
      });

      // Add if exemption has this policy in its list
      addIfIncludesPolicy(p, policyMap, e, ownerId);

      // Check if matcher no longer has this policy from previous CR version
      deleteIfPolicyRemoved(p, policyMap, e, ownerId);
    }

    // Check if policy should no longer have this matcher from previous CR version
    deleteIfMatchersRemoved(p, policyMap, currExemptMatchers, ownerId);
  }

  updateStore(policyMap);
}

//(Performance Optimization) Use local map to do aggregation before updating store
export function removeExemptions(exempt: UDSExemption) {
  const { policyMap } = setupPolicyMap();

  Log.debug(`Removing policy exemptions for ${exempt.metadata?.name}`);

  // Loop through exemptions and remove matchers from policies in the local map
  for (const e of exempt.spec?.exemptions ?? []) {
    for (const p of e.policies) {
      const matchers = policyMap.get(p) || [];
      const filteredList = matchers.filter(m => {
        if (!isSame(m, { ...e.matcher, owner: exempt.metadata?.uid || "" })) return m;
      });
      policyMap.set(p, filteredList);
    }
  }

  updateStore(policyMap);
}
