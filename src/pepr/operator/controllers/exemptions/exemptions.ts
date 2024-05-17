import { Log, R } from "pepr";
import { PolicyMap } from "../../../policies";
import { Policy, UDSExemption } from "../../crd";

export enum WatchPhase {
  Added = "ADDED",
  Modified = "MODIFIED",
  Deleted = "DELETED",
  Bookmark = "BOOKMARK",
  Error = "ERROR",
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
      // Add current matchers back to map if they exists in the new list
      if (R.includes(cm, incomingMatchers)) {
        mergedMatchers.push(cm);
      }
      // Add all matchers owned by a different owner
      if (cm.owner !== owner) {
        mergedMatchers.push(cm);
      }
    }

    // Combine new matchers with old, ignoring duplicates
    const newMatchers = R.union(mergedMatchers, incomingMatchers);

    // Only update the map if there are diffs
    if (!R.equals(currentMatchers, newMatchers)) {
      realMap.set(policy, newMatchers);
      Log.debug(`Updated exemptions for ${policy}: ${JSON.stringify(newMatchers)}`);
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
        if (!R.equals(m, { ...e.matcher, owner: exempt.metadata?.uid || "" })) return m;
      });
      exemptionMap.set(p, filteredList);
    }
  }
  Log.debug(`Removed all policy exemptions for ${exempt.metadata?.name}`);
}
