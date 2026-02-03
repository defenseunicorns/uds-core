/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { beforeEach, describe, expect, it } from "vitest";
import { Matcher, MatcherKind, Policy } from "../../crd/index.js";
import { ExemptionStore } from "./exemption-store.js";

const falcoMatcher = {
  namespace: "falco",
  name: "^falco-pod.*",
  kind: MatcherKind.Pod,
};

const falcosidekickMatcher = {
  namespace: "falco",
  name: "^falcosidekick-pod.*",
  kind: MatcherKind.Pod,
};

const getExemption = (uid: string, matcher: Matcher, policies: Policy[]) => {
  return {
    metadata: {
      uid,
    },
    spec: {
      exemptions: [
        {
          matcher,
          policies,
        },
      ],
    },
  };
};

describe("Exemption Store", () => {
  beforeEach(() => {
    ExemptionStore.init();
  });

  it("Add exemption", async () => {
    const e = getExemption("uid", falcoMatcher, [Policy.DisallowPrivileged]);
    ExemptionStore.add(e);
    const matchers = ExemptionStore.getByPolicy(Policy.DisallowPrivileged);

    expect(matchers).toHaveLength(1);
  });

  it("Delete exemption", async () => {
    const e = getExemption("uid", falcoMatcher, [Policy.DisallowPrivileged]);
    ExemptionStore.add(e);
    let matchers = ExemptionStore.getByPolicy(Policy.DisallowPrivileged);
    expect(matchers).toHaveLength(1);
    ExemptionStore.remove(e);

    matchers = ExemptionStore.getByPolicy(Policy.DisallowPrivileged);
    expect(matchers).toHaveLength(0);
  });

  it("Update exemption", async () => {
    const enforcerException = getExemption("uid", falcoMatcher, [Policy.DisallowPrivileged]);
    ExemptionStore.add(enforcerException);

    let matchers = ExemptionStore.getByPolicy(Policy.DisallowPrivileged);
    expect(matchers).toHaveLength(1);

    const controllerExemption = getExemption("uid", falcosidekickMatcher, [
      Policy.RequireNonRootUser,
    ]);
    ExemptionStore.add(controllerExemption);

    matchers = ExemptionStore.getByPolicy(Policy.DisallowPrivileged);
    expect(matchers).toHaveLength(0);
  });

  it("Add multiple policies", async () => {
    const enforcerException = getExemption("foo", falcoMatcher, [Policy.DisallowPrivileged]);
    ExemptionStore.add(enforcerException);

    let matchers = ExemptionStore.getByPolicy(Policy.DisallowPrivileged);
    expect(matchers).toHaveLength(1);

    const controllerExemption = getExemption("bar", falcosidekickMatcher, [
      Policy.RequireNonRootUser,
    ]);
    ExemptionStore.add(controllerExemption);

    matchers = ExemptionStore.getByPolicy(Policy.DisallowPrivileged);
    expect(matchers).toHaveLength(1);

    matchers = ExemptionStore.getByPolicy(Policy.RequireNonRootUser);
    expect(matchers).toHaveLength(1);
  });

  it("Add duplicate exemptions owned by different owners", async () => {
    const enforcerException = getExemption("foo", falcoMatcher, [Policy.DisallowPrivileged]);
    const otherEnforcerException = getExemption("bar", falcoMatcher, [Policy.DisallowPrivileged]);
    ExemptionStore.add(enforcerException);
    ExemptionStore.add(otherEnforcerException);

    const matchers = ExemptionStore.getByPolicy(Policy.DisallowPrivileged);
    expect(matchers).toHaveLength(2);
  });
});
