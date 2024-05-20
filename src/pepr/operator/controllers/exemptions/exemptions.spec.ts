import { beforeEach, describe, expect, it } from "@jest/globals";
import { PolicyMap } from "../../../policies";
import { MatcherKind, Policy } from "../../crd";
import { Exemption } from "../../crd/generated/exemption-v1alpha1";
import { initPolicyMap, policyExemptionMap } from "./exemption-store";
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
const promtailMatcher = { namespace: "promtail", name: "^promtail-.*", kind: MatcherKind.Pod };
const exemption1UID = "exemption-1-uid";
const exemption2UID = "exemption-2-uid";
const storedEnforcerMatcher = { ...enforcerMatcher, owner: exemption1UID };
const storedControllerMatcher = { ...controllerMatcher, owner: exemption1UID };
const storedPrometheusMatcher = { ...prometheusMatcher, owner: exemption1UID };
const storedPromtailMatcher = { ...promtailMatcher, owner: exemption2UID };
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

let exemptionMap: PolicyMap;

describe("Test processExemptions() no duplicate matchers in same CR", () => {
  beforeEach(() => {
    initPolicyMap();
    exemptionMap = policyExemptionMap
  });

  it("Add exemptions for the first time", async () => {
    processExemptions(neuvectorMockExemption, WatchPhase.Added);
    expect(exemptionMap.get(Policy.RequireNonRootUser)).toEqual([storedEnforcerMatcher]);
    expect(exemptionMap.get(Policy.DisallowPrivileged)).toEqual([
      storedEnforcerMatcher,
      storedControllerMatcher,
    ]);
    expect(exemptionMap.get(Policy.DropAllCapabilities)).toEqual([
      storedEnforcerMatcher,
      storedControllerMatcher,
      storedPrometheusMatcher,
    ]);
  });

  it("Does not re-add matchers on updates", async () => {
    processExemptions(neuvectorMockExemption, WatchPhase.Added);
    processExemptions(neuvectorMockExemption, WatchPhase.Modified);
    expect(exemptionMap.get(Policy.DisallowPrivileged)).toEqual([
      storedEnforcerMatcher,
      storedControllerMatcher,
    ]);
    expect(exemptionMap.get(Policy.DropAllCapabilities)).toEqual([
      storedEnforcerMatcher,
      storedControllerMatcher,
      storedPrometheusMatcher,
    ]);
  });

  it("Handles updates -- remove policy, remove matcher, add policy, add matcher", async () => {
    // remove RequireNonRootUser from enforcerMatcher
    // remove prometheusMatcher
    // add DisallowHostNamespaces to controllerMatcher
    // add promtailMatcher with RequireNonRootUser
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
            matcher: promtailMatcher,
            policies: [Policy.RequireNonRootUser],
          },
        ],
      },
    } as Exemption;

    processExemptions(neuvectorMockExemption, WatchPhase.Added);
    processExemptions(updatedNeuvectorExemption, WatchPhase.Modified);
    expect(exemptionMap.get(Policy.RequireNonRootUser)).toEqual([
      { ...storedPromtailMatcher, owner: exemption1UID },
    ]);
    expect(exemptionMap.get(Policy.DisallowPrivileged)).toEqual([
      storedEnforcerMatcher,
      storedControllerMatcher,
    ]);
    expect(exemptionMap.get(Policy.DropAllCapabilities)).toEqual([
      storedEnforcerMatcher,
      storedControllerMatcher,
    ]);
    expect(exemptionMap.get(Policy.DisallowHostNamespaces)).toEqual([storedControllerMatcher]);
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

    expect(exemptionMap.get(Policy.DisallowPrivileged)).toEqual([storedEnforcerMatcher]);
    expect(exemptionMap.get(Policy.DropAllCapabilities)).toEqual([storedEnforcerMatcher]);
    expect(exemptionMap.get(Policy.RequireNonRootUser)).toEqual([storedEnforcerMatcher]);
    expect(exemptionMap.get(Policy.DisallowNodePortServices)).toEqual([
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

    expect(exemptionMap.get(Policy.DisallowPrivileged)).toEqual([
      storedEnforcerMatcher,
      {
        ...storedEnforcerMatcher,
        namespace: diffNS,
      },
    ]);
    expect(exemptionMap.get(Policy.DropAllCapabilities)).toEqual([
      storedEnforcerMatcher,
      {
        ...storedEnforcerMatcher,
        namespace: diffNS,
      },
    ]);
    expect(exemptionMap.get(Policy.RequireNonRootUser)).toEqual([
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

    expect(exemptionMap.get(Policy.DisallowPrivileged)).toEqual([
      storedEnforcerMatcher,
      {
        ...storedEnforcerMatcher,
        namespace: diffNS,
      },
    ]);
    expect(exemptionMap.get(Policy.DropAllCapabilities)).toEqual([storedEnforcerMatcher]);
    expect(exemptionMap.get(Policy.RequireNonRootUser)).toEqual([storedEnforcerMatcher]);
  });
});

describe("Test processExemptions() duplicate matchers in same CR", () => {
  beforeEach(() => {
    initPolicyMap();
    exemptionMap = policyExemptionMap
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
    expect(exemptionMap.get(Policy.RequireNonRootUser)).toEqual([storedEnforcerMatcher]);
    expect(exemptionMap.get(Policy.DisallowPrivileged)).toEqual([storedEnforcerMatcher]);
    expect(exemptionMap.get(Policy.DropAllCapabilities)).toEqual([storedEnforcerMatcher]);
  });

  it("Does not re-add matchers on updates", () => {
    processExemptions(sameMatcherMockExemption, WatchPhase.Added);
    processExemptions(sameMatcherMockExemption, WatchPhase.Modified);

    expect(exemptionMap.get(Policy.RequireNonRootUser)).toEqual([storedEnforcerMatcher]);
    expect(exemptionMap.get(Policy.DisallowPrivileged)).toEqual([storedEnforcerMatcher]);
    expect(exemptionMap.get(Policy.DropAllCapabilities)).toEqual([storedEnforcerMatcher]);
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

    expect(exemptionMap.get(Policy.RequireNonRootUser)).toEqual([]);
    expect(exemptionMap.get(Policy.DisallowPrivileged)).toEqual([
      storedEnforcerMatcher,
      storedControllerMatcher,
    ]);
    expect(exemptionMap.get(Policy.DropAllCapabilities)).toEqual([storedEnforcerMatcher]);
    expect(exemptionMap.get(Policy.DisallowHostNamespaces)).toEqual([storedEnforcerMatcher]);
  });
});

describe("Test processExemptions(); phase DELETED", () => {
  beforeEach(() => {
    initPolicyMap();
    exemptionMap = policyExemptionMap
  });

  it("Removes all CRs exemptions when deleted", async () => {
    processExemptions(neuvectorMockExemption, WatchPhase.Added);
    processExemptions(neuvectorMockExemption, WatchPhase.Deleted);
    expect(exemptionMap.get(Policy.DisallowPrivileged)).toEqual([]);
    expect(exemptionMap.get(Policy.DropAllCapabilities)).toEqual([]);
  });

  it("Does not remove exemptions set by separate CR from the one being deleted", async () => {
    const promtailMockExemption = {
      metadata: {
        uid: exemption2UID,
      },
      spec: {
        exemptions: [
          {
            matcher: promtailMatcher,
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
    processExemptions(promtailMockExemption, WatchPhase.Added);
    processExemptions(neuvectorMockExemption, WatchPhase.Deleted);

    expect(exemptionMap.get(Policy.DisallowPrivileged)).toEqual([storedPromtailMatcher]);
    expect(exemptionMap.get(Policy.DropAllCapabilities)).toEqual([storedPromtailMatcher]);
    expect(exemptionMap.get(Policy.RequireNonRootUser)).toEqual([storedPromtailMatcher]);
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

    expect(exemptionMap.get(Policy.DisallowPrivileged)).toEqual([storedEnforcerMatcher]);
    expect(exemptionMap.get(Policy.DropAllCapabilities)).toEqual([storedEnforcerMatcher]);
    expect(exemptionMap.get(Policy.RequireNonRootUser)).toEqual([storedEnforcerMatcher]);
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

    const promtailMockExemption = {
      metadata: {
        uid: exemption2UID,
      },
      spec: {
        exemptions: [
          {
            matcher: promtailMatcher,
            policies: [Policy.DisallowPrivileged],
          },
        ],
      },
    } as Exemption;

    const promtailUpdatedMockExemption = {
      metadata: {
        uid: exemption2UID,
      },
      spec: {
        exemptions: [
          {
            matcher: promtailMatcher,
            policies: [Policy.DisallowPrivileged, Policy.RequireNonRootUser],
          },
        ],
      },
    } as Exemption;

    processExemptions(neuvectorMockExemption, WatchPhase.Added);
    processExemptions(promtailMockExemption, WatchPhase.Added);
    processExemptions(promtailUpdatedMockExemption, WatchPhase.Modified);

    expect(exemptionMap.get(Policy.RequireNonRootUser)).toEqual([
      storedEnforcerMatcher,
      storedPromtailMatcher,
    ]);
    expect(exemptionMap.get(Policy.DropAllCapabilities)).toEqual([storedEnforcerMatcher]);
    expect(exemptionMap.get(Policy.DisallowPrivileged)).toEqual([storedPromtailMatcher]);
  });
});
