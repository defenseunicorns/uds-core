/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { Component, setupLogger } from "../../../logger.js";
import { StoredMatcher } from "../../../policies/index.js";
import { Matcher, Policy, UDSExemption } from "../../crd/index.js";

// configure subproject logger
const log = setupLogger(Component.OPERATOR_EXEMPTIONS);

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

function addMatcher(matcher: Matcher, p: Policy, owner: string = ""): void {
  const storedMatcher = {
    ...matcher,
    owner,
  };

  const storedMatchers = getByPolicy(p);
  storedMatchers.push(storedMatcher);
}

// Iterate through each exemption block of CR and add matchers to PolicyMap
function add(exemption: UDSExemption, logger: boolean = true) {
  // Remove any existing exemption for this owner, in case of WatchPhase.Modified
  remove(exemption);
  const owner = exemption.metadata?.uid || "";
  policyOwnerMap.set(owner, exemption);

  for (const e of exemption.spec?.exemptions ?? []) {
    const policies = e.policies ?? [];
    for (const p of policies) {
      // Append the matcher to the list of stored matchers for this policy
      addMatcher(e.matcher, p, owner);
      if (logger) {
        log.debug(`Added exemption to ${p}: ${JSON.stringify(e.matcher)}`);
      }
    }
  }
}

function remove(exemption: UDSExemption) {
  const owner = exemption.metadata?.uid || "";
  const prevExemption = policyOwnerMap.get(owner);

  if (prevExemption) {
    for (const e of prevExemption.spec?.exemptions ?? []) {
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
    log.debug(`Removed all policy exemptions for ${owner}`);
  } else {
    log.debug(`No existing exemption for owner ${owner}`);
  }
}

// export object with all included export as properties
export const ExemptionStore = {
  init,
  add,
  remove,
  getByPolicy,
};
