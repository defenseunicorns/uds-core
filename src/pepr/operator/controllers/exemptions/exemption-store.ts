import { Log } from "pepr";
import { StoredMatcher } from "../../../policies";
import { ExemptionElement, Policy, UDSExemption } from "../../crd";

export type PolicyOwnerMap = Map<string, UDSExemption>;
export type PolicyMap = Map<Policy, StoredMatcher[]>;
let policyExemptionMap: PolicyMap;
let policyOwnerMap: PolicyOwnerMap;

function init(): void {
  policyExemptionMap = new Map();
  policyOwnerMap = new Map();
  for (const p of Object.values(Policy)) {
    policyExemptionMap.set(p, []);
  }
}

function getByPolicy(policy: Policy): StoredMatcher[] {
  return policyExemptionMap.get(policy) || [];
}

function setByPolicy(policy: Policy, matchers: StoredMatcher[]): void {
  policyExemptionMap.set(policy, matchers);
}

function getMatchersFromExemptionElement(
  owner: string = "",
  exemption: ExemptionElement,
): StoredMatcher {
  return {
    ...exemption.matcher,
    owner,
  };
}

function addMatcherToPolicy(p: Policy, matcher: StoredMatcher): void {
  const storedMatchers = getByPolicy(p);
  storedMatchers.push(matcher);
}

// Iterate through each exemption block of CR and add matchers to PolicyMap
function add(exemption: UDSExemption, log: boolean = true) {
  remove(exemption);
  policyOwnerMap.set(exemption.metadata?.uid || "", exemption);

  const exemptions = exemption.spec?.exemptions ?? [];
  for (const e of exemptions) {
    const matcherToStore = getMatchersFromExemptionElement(exemption.metadata?.uid, e);

    const policies = e.policies ?? [];
    for (const p of policies) {
      // Append the matcher to the list of stored matchers for this policy
      addMatcherToPolicy(p, matcherToStore);
      if (log) {
        Log.debug(`Added exemption to ${p}: ${JSON.stringify(matcherToStore)}`);
      }
    }
  }
}

function remove(exemption: UDSExemption) {
  const owner = exemption.metadata?.uid || "";
  const prevExemption = policyOwnerMap.get(owner);

  if (prevExemption) {
    const exemptions = prevExemption.spec?.exemptions ?? [];
    for (const e of exemptions) {
      const policies = e.policies ?? [];
      for (const p of policies) {
        const existingMatchers = getByPolicy(p);
        const filteredList = existingMatchers.filter(m => {
          return m.owner !== owner;
        });
        setByPolicy(p, filteredList);
      }
    }
    policyOwnerMap.delete(owner);
    Log.debug(`Removed all policy exemptions for ${owner}`);
  } else {
    Log.debug(`No existing exemption for owner ${owner}`);
  }
}

// export object with all included export as properties
export const ExemptionStore = {
  init,
  add,
  remove,
  getByPolicy,
};
