import { beforeEach, describe, expect, it } from "@jest/globals";
import { MatcherKind, Policy } from "../../crd";
import { Exemption } from "../../crd/generated/exemption-v1alpha1";
import { ExemptionStore } from "./exemption-store";
import { WatchPhase, processExemptions } from "./exemptions";

const enforcerMatcher = {
  namespace: "neuvector",
  name: "^neuvector-enforcer-pod.*",
  kind: MatcherKind.Pod,
};
const controllerMatcher = {
  namespace: "neuvector",
  name: "^neuvector-controller-pod.*",
  kind: MatcherKind.Pod,
};
const prometheusMatcher = {
  namespace: "neuvector",
  name: "^neuvector-prometheus-exporter-pod.*",
  kind: MatcherKind.Pod,
};
const alloyMatcher = { namespace: "alloy", name: "^alloy-.*", kind: MatcherKind.Pod };
const exemption1UID = "exemption-1-uid";
const exemption2UID = "exemption-2-uid";
const storedEnforcerMatcher = { ...enforcerMatcher, owner: exemption1UID };
const storedControllerMatcher = { ...controllerMatcher, owner: exemption1UID };
const storedPrometheusMatcher = { ...prometheusMatcher, owner: exemption1UID };
const storedAlloyMatcher = { ...alloyMatcher, owner: exemption2UID };
const neuvectorMockExemption = {
  metadata: {
    uid: exemption1UID,
  },
  spec: {
    exemptions: [
      {
        matcher: enforcerMatcher,
        policies: [
          Policy.DisallowPrivileged,
          Policy.DropAllCapabilities,
          Policy.RequireNonRootUser,
        ],
      },
      {
        matcher: controllerMatcher,
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
    processExemptions(neuvectorMockExemption, WatchPhase.Added);
    expect(ExemptionStore.getByPolicy(Policy.RequireNonRootUser)).toEqual([storedEnforcerMatcher]);
    expect(ExemptionStore.getByPolicy(Policy.DisallowPrivileged)).toEqual([
      storedEnforcerMatcher,
      storedControllerMatcher,
    ]);
    expect(ExemptionStore.getByPolicy(Policy.DropAllCapabilities)).toEqual([
      storedEnforcerMatcher,
      storedControllerMatcher,
      storedPrometheusMatcher,
    ]);
  });

  it("Does not re-add matchers on updates", async () => {
    processExemptions(neuvectorMockExemption, WatchPhase.Added);
    processExemptions(neuvectorMockExemption, WatchPhase.Modified);
    expect(ExemptionStore.getByPolicy(Policy.DisallowPrivileged)).toEqual([
      storedEnforcerMatcher,
      storedControllerMatcher,
    ]);
    expect(ExemptionStore.getByPolicy(Policy.DropAllCapabilities)).toEqual([
      storedEnforcerMatcher,
      storedControllerMatcher,
      storedPrometheusMatcher,
    ]);
  });

  it("Handles updates -- remove policy, remove matcher, add policy, add matcher", async () => {
    // remove RequireNonRootUser from enforcerMatcher
    // remove prometheusMatcher
    // add DisallowHostNamespaces to controllerMatcher
    // add alloyMatcher with RequireNonRootUser
    const updatedNeuvectorExemption = {
      metadata: {
        uid: exemption1UID,
      },
      spec: {
        exemptions: [
          {
            matcher: enforcerMatcher,
            policies: [Policy.DisallowPrivileged, Policy.DropAllCapabilities],
          },
          {
            matcher: controllerMatcher,
            policies: [
              Policy.DisallowPrivileged,
              Policy.DropAllCapabilities,
              Policy.DisallowHostNamespaces,
            ],
          },
          {
            matcher: alloyMatcher,
            policies: [Policy.RequireNonRootUser],
          },
        ],
      },
    } as Exemption;

    processExemptions(neuvectorMockExemption, WatchPhase.Added);
    processExemptions(updatedNeuvectorExemption, WatchPhase.Modified);
    expect(ExemptionStore.getByPolicy(Policy.RequireNonRootUser)).toEqual([
      { ...storedAlloyMatcher, owner: exemption1UID },
    ]);
    expect(ExemptionStore.getByPolicy(Policy.DisallowPrivileged)).toEqual([
      storedEnforcerMatcher,
      storedControllerMatcher,
    ]);
    expect(ExemptionStore.getByPolicy(Policy.DropAllCapabilities)).toEqual([
      storedEnforcerMatcher,
      storedControllerMatcher,
    ]);
    expect(ExemptionStore.getByPolicy(Policy.DisallowHostNamespaces)).toEqual([
      storedControllerMatcher,
    ]);
  });

  it("Adds duplicate exemptions set by same CR if different matcher kind", async () => {
    const neuvectorMockExemption2 = {
      metadata: {
        uid: exemption1UID,
      },
      spec: {
        exemptions: [
          {
            matcher: enforcerMatcher,
            policies: [
              Policy.DisallowPrivileged,
              Policy.DropAllCapabilities,
              Policy.RequireNonRootUser,
            ],
          },
          {
            matcher: { ...enforcerMatcher, kind: MatcherKind.Service },
            policies: [Policy.DisallowNodePortServices],
          },
        ],
      },
    } as Exemption;

    processExemptions(neuvectorMockExemption2, WatchPhase.Added);

    expect(ExemptionStore.getByPolicy(Policy.DisallowPrivileged)).toEqual([storedEnforcerMatcher]);
    expect(ExemptionStore.getByPolicy(Policy.DropAllCapabilities)).toEqual([storedEnforcerMatcher]);
    expect(ExemptionStore.getByPolicy(Policy.RequireNonRootUser)).toEqual([storedEnforcerMatcher]);
    expect(ExemptionStore.getByPolicy(Policy.DisallowNodePortServices)).toEqual([
      { ...storedEnforcerMatcher, kind: MatcherKind.Service },
    ]);
  });

  it("Adds duplicate exemptions set by same CR if different namespace", async () => {
    const diffNS = "differentNS";
    const neuvectorMockExemption2 = {
      metadata: {
        uid: exemption1UID,
      },
      spec: {
        exemptions: [
          {
            matcher: enforcerMatcher,
            policies: [
              Policy.DisallowPrivileged,
              Policy.DropAllCapabilities,
              Policy.RequireNonRootUser,
            ],
          },
          {
            matcher: { ...enforcerMatcher, namespace: diffNS },
            policies: [
              Policy.DisallowPrivileged,
              Policy.DropAllCapabilities,
              Policy.RequireNonRootUser,
            ],
          },
        ],
      },
    } as Exemption;

    processExemptions(neuvectorMockExemption2, WatchPhase.Added);

    expect(ExemptionStore.getByPolicy(Policy.DisallowPrivileged)).toEqual([
      storedEnforcerMatcher,
      {
        ...storedEnforcerMatcher,
        namespace: diffNS,
      },
    ]);
    expect(ExemptionStore.getByPolicy(Policy.DropAllCapabilities)).toEqual([
      storedEnforcerMatcher,
      {
        ...storedEnforcerMatcher,
        namespace: diffNS,
      },
    ]);
    expect(ExemptionStore.getByPolicy(Policy.RequireNonRootUser)).toEqual([
      storedEnforcerMatcher,
      {
        ...storedEnforcerMatcher,
        namespace: diffNS,
      },
    ]);
  });

  it("Adds duplicate exemptions set by same CR if different namespace and different policy list", async () => {
    const diffNS = "differentNS";
    const neuvectorMockExemption2 = {
      metadata: {
        uid: exemption1UID,
      },
      spec: {
        exemptions: [
          {
            matcher: enforcerMatcher,
            policies: [
              Policy.DisallowPrivileged,
              Policy.DropAllCapabilities,
              Policy.RequireNonRootUser,
            ],
          },
          {
            matcher: { ...enforcerMatcher, namespace: diffNS },
            policies: [Policy.DisallowPrivileged],
          },
        ],
      },
    } as Exemption;

    processExemptions(neuvectorMockExemption2, WatchPhase.Added);

    expect(ExemptionStore.getByPolicy(Policy.DisallowPrivileged)).toEqual([
      storedEnforcerMatcher,
      {
        ...storedEnforcerMatcher,
        namespace: diffNS,
      },
    ]);
    expect(ExemptionStore.getByPolicy(Policy.DropAllCapabilities)).toEqual([storedEnforcerMatcher]);
    expect(ExemptionStore.getByPolicy(Policy.RequireNonRootUser)).toEqual([storedEnforcerMatcher]);
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
          matcher: enforcerMatcher,
          policies: [Policy.DisallowPrivileged],
        },
        {
          matcher: enforcerMatcher,
          policies: [Policy.RequireNonRootUser],
        },
        {
          matcher: enforcerMatcher,
          policies: [Policy.DropAllCapabilities],
        },
      ],
    },
  };

  it("Adds same matchers with different policies", () => {
    processExemptions(sameMatcherMockExemption, WatchPhase.Added);
    expect(ExemptionStore.getByPolicy(Policy.RequireNonRootUser)).toEqual([storedEnforcerMatcher]);
    expect(ExemptionStore.getByPolicy(Policy.DisallowPrivileged)).toEqual([storedEnforcerMatcher]);
    expect(ExemptionStore.getByPolicy(Policy.DropAllCapabilities)).toEqual([storedEnforcerMatcher]);
  });

  it("Does not re-add matchers on updates", () => {
    processExemptions(sameMatcherMockExemption, WatchPhase.Added);
    processExemptions(sameMatcherMockExemption, WatchPhase.Modified);

    expect(ExemptionStore.getByPolicy(Policy.RequireNonRootUser)).toEqual([storedEnforcerMatcher]);
    expect(ExemptionStore.getByPolicy(Policy.DisallowPrivileged)).toEqual([storedEnforcerMatcher]);
    expect(ExemptionStore.getByPolicy(Policy.DropAllCapabilities)).toEqual([storedEnforcerMatcher]);
  });

  it.only("Handles updates - remove policy, remove matcher, add policy, add matcher", async () => {
    // remove RequireNonRoot from enforcerMatcher (satisfies remove matcher in this duplicate case)
    // add DisallowHostNamespaces to enforcerMatcher
    // add controllerMatcher with DisallowPrivileged
    const updateSameMatcherMock = {
      metadata: {
        uid: exemption1UID,
      },
      spec: {
        exemptions: [
          {
            matcher: enforcerMatcher,
            policies: [Policy.DisallowPrivileged],
          },
          {
            matcher: enforcerMatcher,
            policies: [Policy.DropAllCapabilities],
          },
          {
            matcher: enforcerMatcher,
            policies: [Policy.DisallowHostNamespaces],
          },
          {
            matcher: controllerMatcher,
            policies: [Policy.DisallowPrivileged],
          },
        ],
      },
    } as Exemption;

    processExemptions(sameMatcherMockExemption, WatchPhase.Added);
    processExemptions(updateSameMatcherMock, WatchPhase.Modified);

    expect(ExemptionStore.getByPolicy(Policy.RequireNonRootUser)).toEqual([]);
    expect(ExemptionStore.getByPolicy(Policy.DisallowPrivileged)).toEqual([
      storedEnforcerMatcher,
      storedControllerMatcher,
    ]);
    expect(ExemptionStore.getByPolicy(Policy.DropAllCapabilities)).toEqual([storedEnforcerMatcher]);
    expect(ExemptionStore.getByPolicy(Policy.DisallowHostNamespaces)).toEqual([
      storedEnforcerMatcher,
    ]);
  });
});

describe("Test processExemptions(); phase DELETED", () => {
  beforeEach(() => {
    ExemptionStore.init();
  });

  it("Removes all CRs exemptions when deleted", async () => {
    processExemptions(neuvectorMockExemption, WatchPhase.Added);
    processExemptions(neuvectorMockExemption, WatchPhase.Deleted);
    expect(ExemptionStore.getByPolicy(Policy.DisallowPrivileged)).toEqual([]);
    expect(ExemptionStore.getByPolicy(Policy.DropAllCapabilities)).toEqual([]);
  });

  it("Does not remove exemptions set by separate CR from the one being deleted", async () => {
    const alloyMockExemption = {
      metadata: {
        uid: exemption2UID,
      },
      spec: {
        exemptions: [
          {
            matcher: alloyMatcher,
            policies: [
              Policy.DisallowPrivileged,
              Policy.DropAllCapabilities,
              Policy.RequireNonRootUser,
            ],
          },
        ],
      },
    } as Exemption;

    processExemptions(neuvectorMockExemption, WatchPhase.Added);
    processExemptions(alloyMockExemption, WatchPhase.Added);
    processExemptions(neuvectorMockExemption, WatchPhase.Deleted);

    expect(ExemptionStore.getByPolicy(Policy.DisallowPrivileged)).toEqual([storedAlloyMatcher]);
    expect(ExemptionStore.getByPolicy(Policy.DropAllCapabilities)).toEqual([storedAlloyMatcher]);
    expect(ExemptionStore.getByPolicy(Policy.RequireNonRootUser)).toEqual([storedAlloyMatcher]);
  });

  it("Does not delete duplicate exemptions if set by separate CRs", async () => {
    const neuvectorMockExemption2 = {
      metadata: {
        uid: exemption1UID,
      },
      spec: {
        exemptions: [
          {
            matcher: enforcerMatcher,
            policies: [
              Policy.DisallowPrivileged,
              Policy.DropAllCapabilities,
              Policy.RequireNonRootUser,
            ],
          },
        ],
      },
    } as Exemption;

    const neuvectorDuplicateMockExemption = {
      metadata: {
        uid: exemption2UID,
      },
      spec: {
        exemptions: [
          {
            matcher: enforcerMatcher,
            policies: [
              Policy.DisallowPrivileged,
              Policy.DropAllCapabilities,
              Policy.RequireNonRootUser,
            ],
          },
        ],
      },
    } as Exemption;

    processExemptions(neuvectorMockExemption2, WatchPhase.Added);
    processExemptions(neuvectorDuplicateMockExemption, WatchPhase.Added);
    processExemptions(neuvectorDuplicateMockExemption, WatchPhase.Deleted);

    expect(ExemptionStore.getByPolicy(Policy.DisallowPrivileged)).toEqual([storedEnforcerMatcher]);
    expect(ExemptionStore.getByPolicy(Policy.DropAllCapabilities)).toEqual([storedEnforcerMatcher]);
    expect(ExemptionStore.getByPolicy(Policy.RequireNonRootUser)).toEqual([storedEnforcerMatcher]);
  });

  it("Does not delete exemptions for the same policies from separate CRs during modification", async () => {
    const neuvectorMockExemption = {
      metadata: {
        uid: exemption1UID,
      },
      spec: {
        exemptions: [
          {
            matcher: enforcerMatcher,
            policies: [Policy.RequireNonRootUser, Policy.DropAllCapabilities],
          },
        ],
      },
    } as Exemption;

    const alloyMockExemption = {
      metadata: {
        uid: exemption2UID,
      },
      spec: {
        exemptions: [
          {
            matcher: alloyMatcher,
            policies: [Policy.DisallowPrivileged],
          },
        ],
      },
    } as Exemption;

    const alloyUpdatedMockExemption = {
      metadata: {
        uid: exemption2UID,
      },
      spec: {
        exemptions: [
          {
            matcher: alloyMatcher,
            policies: [Policy.DisallowPrivileged, Policy.RequireNonRootUser],
          },
        ],
      },
    } as Exemption;

    processExemptions(neuvectorMockExemption, WatchPhase.Added);
    processExemptions(alloyMockExemption, WatchPhase.Added);
    processExemptions(alloyUpdatedMockExemption, WatchPhase.Modified);

    expect(ExemptionStore.getByPolicy(Policy.RequireNonRootUser)).toEqual([
      storedEnforcerMatcher,
      storedAlloyMatcher,
    ]);
    expect(ExemptionStore.getByPolicy(Policy.DropAllCapabilities)).toEqual([storedEnforcerMatcher]);
    expect(ExemptionStore.getByPolicy(Policy.DisallowPrivileged)).toEqual([storedAlloyMatcher]);
  });
});
