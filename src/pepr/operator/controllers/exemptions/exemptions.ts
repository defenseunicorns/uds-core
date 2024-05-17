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

function isSameMatcherList(a: StoredMatcher[], b: StoredMatcher[]): boolean {
  if (a.length !== b.length) {
    return false;
  }

  // Order mismatches do not matter for our matcher lists, sort to organize identical
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();

  sortedA.every(function (element, index) {
    if (element === sortedB[index]) {
      return false;
    }
  });

  return true;
}

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
      // Append the matcher to the list of stored matchers for this policy
      const storedMatchers = map.get(p) || [];
      storedMatchers.push(matcherToStore);
      map.set(p, storedMatchers);
      if (log) {
        Log.debug(`Added exemption to ${p}: ${JSON.stringify(matcherToStore)}`);
      }
    }
  }
}

// Update the PolicyMap, adding or subtracting matchers based on comparison of maps
function compareAndMerge(tempMap: PolicyMap, realMap: PolicyMap, owner: string) {
  for (const [policy, currentMatchers] of realMap.entries()) {
    const incomingMatchers = tempMap.get(policy) || [];
    const mergedMatchers = [];

    for (const cm of currentMatchers) {
      // add currentMatcher back to map if it exists in the new list
      if (incomingMatchers.includes(cm)) {
        mergedMatchers.push(cm);
      }
      // add all exemptions owned by a different owner
      if (cm.owner !== owner) {
        mergedMatchers.push(cm);
      }
    }

    for (const im of incomingMatchers) {
      // add incomingMatcher if it's new (e.g. does not match anything in the updated list)
      if (!mergedMatchers.includes(im)) {
        mergedMatchers.push(im);
      }
    }

    // Only update the map if there are diffs
    if (!isSameMatcherList(currentMatchers, mergedMatchers)) {
      realMap.set(policy, mergedMatchers);
      Log.debug(`Updated exemptions for ${policy}: ${JSON.stringify(mergedMatchers)}`);
    }
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
  const exemptionOwner = exempt.metadata?.uid || "";
  switch (phase) {
    case WatchPhase.Added:
      addToMap(exemptionMap, exempt);
      break;

    case WatchPhase.Modified: {
      const tempMap = setupMap();
      addToMap(tempMap, exempt, false);
      compareAndMerge(tempMap, exemptionMap, exemptionOwner);
      break;
    }

    case WatchPhase.Deleted:
      removeExemptions(exempt, exemptionMap);
      break;
  }
}

export function removeExemptions(exempt: UDSExemption, exemptionMap: PolicyMap) {
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
  Log.debug(`Removed all policy exemptions for ${exempt.metadata?.name}`);
}
