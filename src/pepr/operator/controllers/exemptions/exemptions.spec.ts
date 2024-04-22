import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { Store } from "../../../policies/common";
import { MatcherKind, Policy } from "../../crd";
import { Exemption } from "../../crd/generated/exemption-v1alpha1";
import { processExemptions, removeExemptions } from "./exemptions";

const mockStore = new Map<string, string>();
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

describe("Test processExemptions()", () => {
  beforeEach(() => {
    jest.spyOn(Store, "getItem").mockImplementation((key: string) => {
      return mockStore.get(key) || null;
    });

    jest.spyOn(Store, "setItem").mockImplementation((key: string, val: string) => {
      mockStore.set(key, val);
    });
  });

  afterEach(() => {
    mockStore.clear();
    jest.restoreAllMocks();
  });

  it("Add exemptions for the first time", async () => {
    processExemptions(neuvectorMockExemption);
    expect(Store.getItem(Policy.RequireNonRootUser)).toEqual(
      `[${JSON.stringify(storedEnforcerMatcher)}]`,
    );
    expect(Store.getItem(Policy.DisallowPrivileged)).toEqual(
      `[${JSON.stringify(storedEnforcerMatcher)},${JSON.stringify(storedControllerMatcher)}]`,
    );
    expect(Store.getItem(Policy.DropAllCapabilities)).toEqual(
      `[${JSON.stringify(storedEnforcerMatcher)},${JSON.stringify(
        storedControllerMatcher,
      )},${JSON.stringify(storedPrometheusMatcher)}]`,
    );
  });

  it("Does not add duplicate matchers for same CR", async () => {
    processExemptions(neuvectorMockExemption);
    processExemptions(neuvectorMockExemption);
    expect(Store.getItem(Policy.DisallowPrivileged)).toEqual(
      `[${JSON.stringify(storedEnforcerMatcher)},${JSON.stringify(storedControllerMatcher)}]`,
    );
    expect(Store.getItem(Policy.DropAllCapabilities)).toEqual(
      `[${JSON.stringify(storedEnforcerMatcher)},${JSON.stringify(
        storedControllerMatcher,
      )},${JSON.stringify(storedPrometheusMatcher)}]`,
    );
  });

  it("Adds duplicate matchers if from separate CR", () => {
    processExemptions(neuvectorMockExemption);
    processExemptions({ ...neuvectorMockExemption, metadata: { uid: exemption2UID } });

    expect(Store.getItem(Policy.DisallowPrivileged)).toEqual(
      `[${JSON.stringify(storedEnforcerMatcher)},${JSON.stringify(
        storedControllerMatcher,
      )},${JSON.stringify({ ...storedEnforcerMatcher, owner: exemption2UID })},${JSON.stringify({
        ...storedControllerMatcher,
        owner: exemption2UID,
      })}]`,
    );
    expect(Store.getItem(Policy.DropAllCapabilities)).toEqual(
      `[${JSON.stringify(storedEnforcerMatcher)},${JSON.stringify(
        storedControllerMatcher,
      )},${JSON.stringify(storedPrometheusMatcher)},${JSON.stringify({
        ...storedEnforcerMatcher,
        owner: exemption2UID,
      })},${JSON.stringify({ ...storedControllerMatcher, owner: exemption2UID })},${JSON.stringify({
        ...storedPrometheusMatcher,
        owner: exemption2UID,
      })}]`,
    );
  });

  it("Removes exemptions from policy if policies removed from matcher policy list on update", async () => {
    const updatedNeuvectorExemption = {
      metadata: {
        uid: exemption1UID,
      },
      spec: {
        exemptions: [
          { matcher: enforcerMatcher, policies: [Policy.DisallowPrivileged] },
          {
            matcher: controllerMatcher,
            policies: [Policy.DropAllCapabilities],
          },
          {
            matcher: prometheusMatcher,
            policies: [Policy.DropAllCapabilities],
          },
        ],
      },
    } as Exemption;

    processExemptions(neuvectorMockExemption);
    processExemptions(updatedNeuvectorExemption);

    expect(Store.getItem(Policy.RequireNonRootUser)).toEqual("[]");
    expect(Store.getItem(Policy.DisallowPrivileged)).toEqual(
      `[${JSON.stringify(storedEnforcerMatcher)}]`,
    );
    expect(Store.getItem(Policy.DropAllCapabilities)).toEqual(
      `[${JSON.stringify(storedControllerMatcher)},${JSON.stringify(storedPrometheusMatcher)}]`,
    );
  });

  it("Removes matchers from policy if matchers removed from CR", () => {
    const updatedNeuvectorExemption = {
      metadata: {
        uid: exemption1UID,
      },
      spec: {
        exemptions: [
          {
            matcher: controllerMatcher,
            policies: [Policy.DisallowPrivileged, Policy.DropAllCapabilities],
          },
          {
            matcher: { ...enforcerMatcher, kind: MatcherKind.Service },
            policies: [Policy.DisallowNodePortServices],
          },
        ],
      },
    } as Exemption;

    processExemptions(neuvectorMockExemption);
    processExemptions(updatedNeuvectorExemption);
    expect(Store.getItem(Policy.RequireNonRootUser)).toEqual("[]");
    expect(Store.getItem(Policy.DisallowPrivileged)).toEqual(
      `[${JSON.stringify(storedControllerMatcher)}]`,
    );
    expect(Store.getItem(Policy.DropAllCapabilities)).toEqual(
      `[${JSON.stringify(storedControllerMatcher)}]`,
    );
    expect(Store.getItem(Policy.DisallowNodePortServices)).toEqual(
      `[${JSON.stringify({ ...storedEnforcerMatcher, kind: MatcherKind.Service })}]`,
    );
  });

  it("Adds duplicate exemptions set by same CR if different matcher kind", () => {
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

    processExemptions(neuvectorMockExemption2);

    expect(Store.getItem(Policy.DisallowPrivileged)).toEqual(
      `[${JSON.stringify(storedEnforcerMatcher)}]`,
    );
    expect(Store.getItem(Policy.DropAllCapabilities)).toEqual(
      `[${JSON.stringify(storedEnforcerMatcher)}]`,
    );
    expect(Store.getItem(Policy.RequireNonRootUser)).toEqual(
      `[${JSON.stringify(storedEnforcerMatcher)}]`,
    );
    expect(Store.getItem(Policy.DisallowNodePortServices)).toEqual(
      `[${JSON.stringify({ ...storedEnforcerMatcher, kind: MatcherKind.Service })}]`,
    );
  });

  it("Adds duplicate exemptions set by same CR if different namespace", () => {
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

    processExemptions(neuvectorMockExemption2);

    expect(Store.getItem(Policy.DisallowPrivileged)).toEqual(
      `[${JSON.stringify(storedEnforcerMatcher)},${JSON.stringify({
        ...storedEnforcerMatcher,
        namespace: diffNS,
      })}]`,
    );
    expect(Store.getItem(Policy.DropAllCapabilities)).toEqual(
      `[${JSON.stringify(storedEnforcerMatcher)},${JSON.stringify({
        ...storedEnforcerMatcher,
        namespace: diffNS,
      })}]`,
    );
    expect(Store.getItem(Policy.RequireNonRootUser)).toEqual(
      `[${JSON.stringify(storedEnforcerMatcher)},${JSON.stringify({
        ...storedEnforcerMatcher,
        namespace: diffNS,
      })}]`,
    );
  });

  it("Adds duplicate exemptions set by same CR if different namespace and different policy list", () => {
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

    processExemptions(neuvectorMockExemption2);

    expect(Store.getItem(Policy.DisallowPrivileged)).toEqual(
      `[${JSON.stringify(storedEnforcerMatcher)},${JSON.stringify({
        ...storedEnforcerMatcher,
        namespace: diffNS,
      })}]`,
    );
    expect(Store.getItem(Policy.DropAllCapabilities)).toEqual(
      `[${JSON.stringify(storedEnforcerMatcher)}]`,
    );
    expect(Store.getItem(Policy.RequireNonRootUser)).toEqual(
      `[${JSON.stringify(storedEnforcerMatcher)}]`,
    );
  });
});

describe("Test removeExemptions()", () => {
  beforeEach(() => {
    jest.spyOn(Store, "getItem").mockImplementation((key: string) => {
      return mockStore.get(key) || null;
    });

    jest.spyOn(Store, "setItem").mockImplementation((key: string, val: string) => {
      mockStore.set(key, val);
    });
  });

  afterEach(() => {
    mockStore.clear();
    jest.restoreAllMocks();
  });

  it("Removes all CRs exemptions when deleted", () => {
    processExemptions(neuvectorMockExemption);
    removeExemptions(neuvectorMockExemption);
    expect(Store.getItem(Policy.DisallowPrivileged)).toEqual("[]");
    expect(Store.getItem(Policy.DropAllCapabilities)).toEqual("[]");
  });

  it("Does not remove exemptions set by separate CR from the one being deleted", () => {
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

    processExemptions(neuvectorMockExemption);
    processExemptions(promtailMockExemption);
    removeExemptions(neuvectorMockExemption);

    expect(Store.getItem(Policy.DisallowPrivileged)).toEqual(
      `[${JSON.stringify(storedPromtailMatcher)}]`,
    );
    expect(Store.getItem(Policy.DropAllCapabilities)).toEqual(
      `[${JSON.stringify(storedPromtailMatcher)}]`,
    );
    expect(Store.getItem(Policy.RequireNonRootUser)).toEqual(
      `[${JSON.stringify(storedPromtailMatcher)}]`,
    );
  });

  it("Does not delete duplicate exemptions if set by separate CRs", () => {
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

    const neuvectorDuplicatMockExemption = {
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

    processExemptions(neuvectorMockExemption2);
    processExemptions(neuvectorDuplicatMockExemption);
    removeExemptions(neuvectorDuplicatMockExemption);

    expect(Store.getItem(Policy.DisallowPrivileged)).toEqual(
      `[${JSON.stringify(storedEnforcerMatcher)}]`,
    );
    expect(Store.getItem(Policy.DropAllCapabilities)).toEqual(
      `[${JSON.stringify(storedEnforcerMatcher)}]`,
    );
    expect(Store.getItem(Policy.RequireNonRootUser)).toEqual(
      `[${JSON.stringify(storedEnforcerMatcher)}]`,
    );
  });
});
