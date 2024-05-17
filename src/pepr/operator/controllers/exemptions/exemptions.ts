import { Log } from "pepr";
import { PolicyMap, StoredMatcher } from "../../../policies";
import { Policy, UDSExemption } from "../../crd";

export enum WatchPhase {
  Added = "ADDED",
  Modified = "MODIFIED",
  Deleted = "DELETED",
  Bookmark = "BOOKMARK",
  Error = "ERROR",
}

const isSame = (a: StoredMatcher, b: StoredMatcher) => {
  return (
    a.name === b.name && a.namespace === b.namespace && a.kind == b.kind && a.owner === b.owner
  );
};

// Iterate through each exemption block of CR and add matchers to PolicyMap
function addToMap(map: PolicyMap, exemption: UDSExemption, log: boolean = true) {
  const exemptions = exemption.spec?.exemptions ?? [];
  for (const e of exemptions) {
    const matcherToStore = {
      ...e.matcher,
      owner: exemption.metadata?.uid || "",
    };

    const policies = e.policies ?? [];
    for (const p of policies) {
      const storedMatchers = map.get(p) ?? [];
      if (log) {
        Log.debug(`Adding to ${p}: ${JSON.stringify([...storedMatchers, matcherToStore])}`);
      }
      map.set(p, [...storedMatchers, matcherToStore]);
    }
  }
}

// Update the PolicyMap, adding or subtracting matchers based on comparison of maps
function compareAndMerge(tempMap: PolicyMap, realMap: PolicyMap) {
  for (const [policy, currentMatchers] of realMap.entries()) {
    const incomingMatchers = tempMap.get(policy) || [];
    const mergedMatchers = [];

    for (const cm of currentMatchers) {
      // add currentMatcher back to map if it exists in the new list and add all matchers that are from a different owner
      if (
        incomingMatchers.some(im => {
          isSame(im, cm) || im.owner != cm.owner;
        })
      ) {
        mergedMatchers.push(cm);
      }
    }

    for (const im of incomingMatchers) {
      // add incomingMatcher if it's new (e.g. does not match anything in the updated list)
      if (
        !mergedMatchers.some(mm => {
          isSame(mm, im);
        })
      ) {
        mergedMatchers.push(im);
      }
    }
    realMap.set(policy, mergedMatchers);
    Log.debug(`Updating ${policy}: ${mergedMatchers}`);
  }
}

export function setupMap() {
  const policyList = Object.values(Policy);
  const tempMap: PolicyMap = new Map();
  for (const p of policyList) {
    tempMap.set(p, []);
  }
  return tempMap;
}

// Handle adding, updating, and deleting exemptions from Policymap
export function processExemptions(
  exempt: UDSExemption,
  phase: WatchPhase,
  exemptionMap: PolicyMap,
) {
  if (phase === WatchPhase.Added) {
    addToMap(exemptionMap, exempt);
  }

  if (phase === WatchPhase.Modified) {
    const tempMap = setupMap();
    addToMap(tempMap, exempt, false);
    compareAndMerge(tempMap, exemptionMap);
  }

  if (phase === WatchPhase.Deleted) {
    removeExemptions(exempt, exemptionMap);
  }
}

export function removeExemptions(exempt: UDSExemption, exemptionMap: PolicyMap) {
  Log.debug(`Removing all policy exemptions for ${exempt.metadata?.name}`);

  // Loop through exemptions and remove matchers from policies in the local map
  for (const e of exempt.spec?.exemptions ?? []) {
    for (const p of e.policies) {
      const matchers = exemptionMap.get(p) || [];
      const filteredList = matchers.filter(m => {
        if (!isSame(m, { ...e.matcher, owner: exempt.metadata?.uid || "" })) return m;
      });
      exemptionMap.set(p, filteredList);
    }
  }
}
