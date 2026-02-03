/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { WatchPhase } from "kubernetes-fluent-client/dist/fluent/shared-types.js";
import { beforeEach, describe, expect, it } from "vitest";
import { Exemption } from "../../crd/generated/exemption-v1alpha1.js";
import { MatcherKind, Policy } from "../../crd/index.js";
import { ExemptionStore } from "./exemption-store.js";
import { processExemptions } from "./exemptions.js";

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
const prometheusMatcher = {
  namespace: "falco",
  name: "^falco-prometheus-exporter-pod.*",
  kind: MatcherKind.Pod,
};
const vectorMatcher = { namespace: "vector", name: "^vector-.*", kind: MatcherKind.Pod };
const exemption1UID = "exemption-1-uid";
const exemption2UID = "exemption-2-uid";
const storedfalcoMatcher = { ...falcoMatcher, owner: exemption1UID };
const storedfalcosidekickMatcher = { ...falcosidekickMatcher, owner: exemption1UID };
const storedPrometheusMatcher = { ...prometheusMatcher, owner: exemption1UID };
const storedVectorMatcher = { ...vectorMatcher, owner: exemption2UID };
const falcoMockExemption = {
  metadata: {
    uid: exemption1UID,
  },
  spec: {
    exemptions: [
      {
        matcher: falcoMatcher,
        policies: [
          Policy.DisallowPrivileged,
          Policy.DropAllCapabilities,
          Policy.RequireNonRootUser,
        ],
      },
      {
        matcher: falcosidekickMatcher,
        policies: [Policy.DisallowPrivileged, Policy.DropAllCapabilities],
      },
      {
        matcher: prometheusMatcher,
        policies: [Policy.DropAllCapabilities],
      },
    ],
  },
} as Exemption;

describe("Test processExemptions() no duplicate matchers in same CR", () => {
  beforeEach(() => {
    ExemptionStore.init();
  });

  it("Add exemptions for the first time", async () => {
    processExemptions(falcoMockExemption, WatchPhase.Added);
    expect(ExemptionStore.getByPolicy(Policy.RequireNonRootUser)).toEqual([storedfalcoMatcher]);
    expect(ExemptionStore.getByPolicy(Policy.DisallowPrivileged)).toEqual([
      storedfalcoMatcher,
      storedfalcosidekickMatcher,
    ]);
    expect(ExemptionStore.getByPolicy(Policy.DropAllCapabilities)).toEqual([
      storedfalcoMatcher,
      storedfalcosidekickMatcher,
      storedPrometheusMatcher,
    ]);
  });

  it("Does not re-add matchers on updates", async () => {
    processExemptions(falcoMockExemption, WatchPhase.Added);
    processExemptions(falcoMockExemption, WatchPhase.Modified);
    expect(ExemptionStore.getByPolicy(Policy.DisallowPrivileged)).toEqual([
      storedfalcoMatcher,
      storedfalcosidekickMatcher,
    ]);
    expect(ExemptionStore.getByPolicy(Policy.DropAllCapabilities)).toEqual([
      storedfalcoMatcher,
      storedfalcosidekickMatcher,
      storedPrometheusMatcher,
    ]);
  });

  it("Handles updates -- remove policy, remove matcher, add policy, add matcher", async () => {
    // remove RequireNonRootUser from falcoMatcher
    // remove prometheusMatcher
    // add DisallowHostNamespaces to falcosidekickMatcher
    // add vectorMatcher with RequireNonRootUser
    const updatedFalcoExemption = {
      metadata: {
        uid: exemption1UID,
      },
      spec: {
        exemptions: [
          {
            matcher: falcoMatcher,
            policies: [Policy.DisallowPrivileged, Policy.DropAllCapabilities],
          },
          {
            matcher: falcosidekickMatcher,
            policies: [
              Policy.DisallowPrivileged,
              Policy.DropAllCapabilities,
              Policy.DisallowHostNamespaces,
            ],
          },
          {
            matcher: vectorMatcher,
            policies: [Policy.RequireNonRootUser],
          },
        ],
      },
    } as Exemption;

    processExemptions(falcoMockExemption, WatchPhase.Added);
    processExemptions(updatedFalcoExemption, WatchPhase.Modified);
    expect(ExemptionStore.getByPolicy(Policy.RequireNonRootUser)).toEqual([
      { ...storedVectorMatcher, owner: exemption1UID },
    ]);
    expect(ExemptionStore.getByPolicy(Policy.DisallowPrivileged)).toEqual([
      storedfalcoMatcher,
      storedfalcosidekickMatcher,
    ]);
    expect(ExemptionStore.getByPolicy(Policy.DropAllCapabilities)).toEqual([
      storedfalcoMatcher,
      storedfalcosidekickMatcher,
    ]);
    expect(ExemptionStore.getByPolicy(Policy.DisallowHostNamespaces)).toEqual([
      storedfalcosidekickMatcher,
    ]);
  });

  it("Adds duplicate exemptions set by same CR if different matcher kind", async () => {
    const falcoMockExemption2 = {
      metadata: {
        uid: exemption1UID,
      },
      spec: {
        exemptions: [
          {
            matcher: falcoMatcher,
            policies: [
              Policy.DisallowPrivileged,
              Policy.DropAllCapabilities,
              Policy.RequireNonRootUser,
            ],
          },
          {
            matcher: { ...falcoMatcher, kind: MatcherKind.Service },
            policies: [Policy.DisallowNodePortServices],
          },
        ],
      },
    } as Exemption;

    processExemptions(falcoMockExemption2, WatchPhase.Added);

    expect(ExemptionStore.getByPolicy(Policy.DisallowPrivileged)).toEqual([storedfalcoMatcher]);
    expect(ExemptionStore.getByPolicy(Policy.DropAllCapabilities)).toEqual([storedfalcoMatcher]);
    expect(ExemptionStore.getByPolicy(Policy.RequireNonRootUser)).toEqual([storedfalcoMatcher]);
    expect(ExemptionStore.getByPolicy(Policy.DisallowNodePortServices)).toEqual([
      { ...storedfalcoMatcher, kind: MatcherKind.Service },
    ]);
  });

  it("Adds duplicate exemptions set by same CR if different namespace", async () => {
    const diffNS = "differentNS";
    const falcoMockExemption2 = {
      metadata: {
        uid: exemption1UID,
      },
      spec: {
        exemptions: [
          {
            matcher: falcoMatcher,
            policies: [
              Policy.DisallowPrivileged,
              Policy.DropAllCapabilities,
              Policy.RequireNonRootUser,
            ],
          },
          {
            matcher: { ...falcoMatcher, namespace: diffNS },
            policies: [
              Policy.DisallowPrivileged,
              Policy.DropAllCapabilities,
              Policy.RequireNonRootUser,
            ],
          },
        ],
      },
    } as Exemption;

    processExemptions(falcoMockExemption2, WatchPhase.Added);

    expect(ExemptionStore.getByPolicy(Policy.DisallowPrivileged)).toEqual([
      storedfalcoMatcher,
      {
        ...storedfalcoMatcher,
        namespace: diffNS,
      },
    ]);
    expect(ExemptionStore.getByPolicy(Policy.DropAllCapabilities)).toEqual([
      storedfalcoMatcher,
      {
        ...storedfalcoMatcher,
        namespace: diffNS,
      },
    ]);
    expect(ExemptionStore.getByPolicy(Policy.RequireNonRootUser)).toEqual([
      storedfalcoMatcher,
      {
        ...storedfalcoMatcher,
        namespace: diffNS,
      },
    ]);
  });

  it("Adds duplicate exemptions set by same CR if different namespace and different policy list", async () => {
    const diffNS = "differentNS";
    const falcoMockExemption2 = {
      metadata: {
        uid: exemption1UID,
      },
      spec: {
        exemptions: [
          {
            matcher: falcoMatcher,
            policies: [
              Policy.DisallowPrivileged,
              Policy.DropAllCapabilities,
              Policy.RequireNonRootUser,
            ],
          },
          {
            matcher: { ...falcoMatcher, namespace: diffNS },
            policies: [Policy.DisallowPrivileged],
          },
        ],
      },
    } as Exemption;

    processExemptions(falcoMockExemption2, WatchPhase.Added);

    expect(ExemptionStore.getByPolicy(Policy.DisallowPrivileged)).toEqual([
      storedfalcoMatcher,
      {
        ...storedfalcoMatcher,
        namespace: diffNS,
      },
    ]);
    expect(ExemptionStore.getByPolicy(Policy.DropAllCapabilities)).toEqual([storedfalcoMatcher]);
    expect(ExemptionStore.getByPolicy(Policy.RequireNonRootUser)).toEqual([storedfalcoMatcher]);
  });
});

describe("Test processExemptions() duplicate matchers in same CR", () => {
  beforeEach(() => {
    ExemptionStore.init();
  });

  const sameMatcherMockExemption = {
    metadata: {
      uid: exemption1UID,
    },
    spec: {
      exemptions: [
        {
          matcher: falcoMatcher,
          policies: [Policy.DisallowPrivileged],
        },
        {
          matcher: falcoMatcher,
          policies: [Policy.RequireNonRootUser],
        },
        {
          matcher: falcoMatcher,
          policies: [Policy.DropAllCapabilities],
        },
      ],
    },
  };

  it("Adds same matchers with different policies", () => {
    processExemptions(sameMatcherMockExemption, WatchPhase.Added);
    expect(ExemptionStore.getByPolicy(Policy.RequireNonRootUser)).toEqual([storedfalcoMatcher]);
    expect(ExemptionStore.getByPolicy(Policy.DisallowPrivileged)).toEqual([storedfalcoMatcher]);
    expect(ExemptionStore.getByPolicy(Policy.DropAllCapabilities)).toEqual([storedfalcoMatcher]);
  });

  it("Does not re-add matchers on updates", () => {
    processExemptions(sameMatcherMockExemption, WatchPhase.Added);
    processExemptions(sameMatcherMockExemption, WatchPhase.Modified);

    expect(ExemptionStore.getByPolicy(Policy.RequireNonRootUser)).toEqual([storedfalcoMatcher]);
    expect(ExemptionStore.getByPolicy(Policy.DisallowPrivileged)).toEqual([storedfalcoMatcher]);
    expect(ExemptionStore.getByPolicy(Policy.DropAllCapabilities)).toEqual([storedfalcoMatcher]);
  });

  it("Handles updates - remove policy, remove matcher, add policy, add matcher", async () => {
    // remove RequireNonRoot from falcoMatcher (satisfies remove matcher in this duplicate case)
    // add DisallowHostNamespaces to falcoMatcher
    // add falcosidekickMatcher with DisallowPrivileged
    const updateSameMatcherMock = {
      metadata: {
        uid: exemption1UID,
      },
      spec: {
        exemptions: [
          {
            matcher: falcoMatcher,
            policies: [Policy.DisallowPrivileged],
          },
          {
            matcher: falcoMatcher,
            policies: [Policy.DropAllCapabilities],
          },
          {
            matcher: falcoMatcher,
            policies: [Policy.DisallowHostNamespaces],
          },
          {
            matcher: falcosidekickMatcher,
            policies: [Policy.DisallowPrivileged],
          },
        ],
      },
    } as Exemption;

    processExemptions(sameMatcherMockExemption, WatchPhase.Added);
    processExemptions(updateSameMatcherMock, WatchPhase.Modified);

    expect(ExemptionStore.getByPolicy(Policy.RequireNonRootUser)).toEqual([]);
    expect(ExemptionStore.getByPolicy(Policy.DisallowPrivileged)).toEqual([
      storedfalcoMatcher,
      storedfalcosidekickMatcher,
    ]);
    expect(ExemptionStore.getByPolicy(Policy.DropAllCapabilities)).toEqual([storedfalcoMatcher]);
    expect(ExemptionStore.getByPolicy(Policy.DisallowHostNamespaces)).toEqual([storedfalcoMatcher]);
  });
});

describe("Test processExemptions(); phase DELETED", () => {
  beforeEach(() => {
    ExemptionStore.init();
  });

  it("Removes all CRs exemptions when deleted", async () => {
    processExemptions(falcoMockExemption, WatchPhase.Added);
    processExemptions(falcoMockExemption, WatchPhase.Deleted);
    expect(ExemptionStore.getByPolicy(Policy.DisallowPrivileged)).toEqual([]);
    expect(ExemptionStore.getByPolicy(Policy.DropAllCapabilities)).toEqual([]);
  });

  it("Does not remove exemptions set by separate CR from the one being deleted", async () => {
    const vectorMockExemption = {
      metadata: {
        uid: exemption2UID,
      },
      spec: {
        exemptions: [
          {
            matcher: vectorMatcher,
            policies: [
              Policy.DisallowPrivileged,
              Policy.DropAllCapabilities,
              Policy.RequireNonRootUser,
            ],
          },
        ],
      },
    } as Exemption;

    processExemptions(falcoMockExemption, WatchPhase.Added);
    processExemptions(vectorMockExemption, WatchPhase.Added);
    processExemptions(falcoMockExemption, WatchPhase.Deleted);

    expect(ExemptionStore.getByPolicy(Policy.DisallowPrivileged)).toEqual([storedVectorMatcher]);
    expect(ExemptionStore.getByPolicy(Policy.DropAllCapabilities)).toEqual([storedVectorMatcher]);
    expect(ExemptionStore.getByPolicy(Policy.RequireNonRootUser)).toEqual([storedVectorMatcher]);
  });

  it("Does not delete duplicate exemptions if set by separate CRs", async () => {
    const falcoMockExemption2 = {
      metadata: {
        uid: exemption1UID,
      },
      spec: {
        exemptions: [
          {
            matcher: falcoMatcher,
            policies: [
              Policy.DisallowPrivileged,
              Policy.DropAllCapabilities,
              Policy.RequireNonRootUser,
            ],
          },
        ],
      },
    } as Exemption;

    const falcoDuplicateMockExemption = {
      metadata: {
        uid: exemption2UID,
      },
      spec: {
        exemptions: [
          {
            matcher: falcoMatcher,
            policies: [
              Policy.DisallowPrivileged,
              Policy.DropAllCapabilities,
              Policy.RequireNonRootUser,
            ],
          },
        ],
      },
    } as Exemption;

    processExemptions(falcoMockExemption2, WatchPhase.Added);
    processExemptions(falcoDuplicateMockExemption, WatchPhase.Added);
    processExemptions(falcoDuplicateMockExemption, WatchPhase.Deleted);

    expect(ExemptionStore.getByPolicy(Policy.DisallowPrivileged)).toEqual([storedfalcoMatcher]);
    expect(ExemptionStore.getByPolicy(Policy.DropAllCapabilities)).toEqual([storedfalcoMatcher]);
    expect(ExemptionStore.getByPolicy(Policy.RequireNonRootUser)).toEqual([storedfalcoMatcher]);
  });

  it("Does not delete exemptions for the same policies from separate CRs during modification", async () => {
    const falcoMockExemption = {
      metadata: {
        uid: exemption1UID,
      },
      spec: {
        exemptions: [
          {
            matcher: falcoMatcher,
            policies: [Policy.RequireNonRootUser, Policy.DropAllCapabilities],
          },
        ],
      },
    } as Exemption;

    const vectorMockExemption = {
      metadata: {
        uid: exemption2UID,
      },
      spec: {
        exemptions: [
          {
            matcher: vectorMatcher,
            policies: [Policy.DisallowPrivileged],
          },
        ],
      },
    } as Exemption;

    const vectorUpdatedMockExemption = {
      metadata: {
        uid: exemption2UID,
      },
      spec: {
        exemptions: [
          {
            matcher: vectorMatcher,
            policies: [Policy.DisallowPrivileged, Policy.RequireNonRootUser],
          },
        ],
      },
    } as Exemption;

    processExemptions(falcoMockExemption, WatchPhase.Added);
    processExemptions(vectorMockExemption, WatchPhase.Added);
    processExemptions(vectorUpdatedMockExemption, WatchPhase.Modified);

    expect(ExemptionStore.getByPolicy(Policy.RequireNonRootUser)).toEqual([
      storedfalcoMatcher,
      storedVectorMatcher,
    ]);
    expect(ExemptionStore.getByPolicy(Policy.DropAllCapabilities)).toEqual([storedfalcoMatcher]);
    expect(ExemptionStore.getByPolicy(Policy.DisallowPrivileged)).toEqual([storedVectorMatcher]);
  });
});
