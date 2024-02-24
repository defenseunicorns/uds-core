import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { Store } from "../../../policies/common";
import { processExemptions, removeExemptions } from "./exemptions";
import { Policy } from "../../crd";
import { Exemption } from "../../crd/generated/exemption-v1alpha1";

const mockStore = new Map<string, string>();
const enforcerMatcher = { namespace: "neuvector", name: "^neuvector-enforcer-pod.*" };
const controllerMatcher = { namespace: "neuvector", name: "^neuvector-controller-pod.*" };
const prometheusMatcher = { namespace: "neuvector", name: "^neuvector-prometheus-exporter-pod.*" };
const storedEnforcerMatcher = { ...enforcerMatcher, owner: "exemption-uid" };
const storedControllerMatcher = { ...controllerMatcher, owner: "exemption-uid" };
const storedPrometheusMatcher = { ...prometheusMatcher, owner: "exemption-uid" };
const mockExemption = {
  metadata: {
    uid: "exemption-uid",
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

describe("Test Exemptions Controller", () => {
  beforeEach(() => {
    jest.spyOn(Store, "getItem").mockImplementation((key: string) => {
      return mockStore.get(key) || null;
    });

    jest.spyOn(Store, "setItem").mockImplementation((key: string, val: string) => {
      mockStore.set(key, val);
    });

    jest.spyOn(Store, "setItemAndWait").mockImplementation(async (key: string, val: string) => {
      await new Promise((resolve, reject) => {
        try {
          resolve(mockStore.set(key, val));
        } catch {
          reject;
        }
      });
    });
  });

  afterEach(() => {
    mockStore.clear();
    jest.restoreAllMocks();
  });

  it("Add exemptions for the first time", async () => {
    processExemptions(mockExemption);
    expect(Store.getItem(Policy.DisallowPrivileged)).toEqual(
      `[${JSON.stringify(storedEnforcerMatcher)},${JSON.stringify(storedControllerMatcher)}]`,
    );
    expect(Store.getItem(Policy.DropAllCapabilities)).toEqual(
      `[${JSON.stringify(storedEnforcerMatcher)},${JSON.stringify(
        storedControllerMatcher,
      )},${JSON.stringify(storedPrometheusMatcher)}]`,
    );
  });

  it("Tries to add same exemptions again and doesn't", async () => {
    processExemptions(mockExemption);
    processExemptions(mockExemption);
    expect(Store.getItem(Policy.DisallowPrivileged)).toEqual(
      `[${JSON.stringify(storedEnforcerMatcher)},${JSON.stringify(storedControllerMatcher)}]`,
    );
    expect(Store.getItem(Policy.DropAllCapabilities)).toEqual(
      `[${JSON.stringify(storedEnforcerMatcher)},${JSON.stringify(
        storedControllerMatcher,
      )},${JSON.stringify(storedPrometheusMatcher)}]`,
    );
  });

  it("Removes exemptions policies when CR updates", async () => {
    const mockExemption2 = {
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
    processExemptions(mockExemption);
    expect(Store.getItem(Policy.DropAllCapabilities)).toEqual(
      `[${JSON.stringify(storedEnforcerMatcher)},${JSON.stringify(
        storedControllerMatcher,
      )},${JSON.stringify(storedPrometheusMatcher)}]`,
    );

    expect(Store.getItem(Policy.RequireNonRootUser)).toEqual(
      `[${JSON.stringify(storedEnforcerMatcher)}]`,
    );

    processExemptions(mockExemption2);
    expect(Store.getItem(Policy.RequireNonRootUser)).toEqual("[]");
    expect(Store.getItem(Policy.DisallowPrivileged)).toEqual(
      `[${JSON.stringify(storedEnforcerMatcher)}]`,
    );
    expect(Store.getItem(Policy.DropAllCapabilities)).toEqual(
      `[${JSON.stringify(storedControllerMatcher)},${JSON.stringify(storedPrometheusMatcher)}]`,
    );
  });

  it("Removes multiple matchers from policy if matcher removed from CR", () => {
    const mockExemption3 = {
      metadata: {
        uid: "exemption-uid",
      },
      spec: {
        exemptions: [
          {
            matcher: controllerMatcher,
            policies: [Policy.DisallowPrivileged, Policy.DropAllCapabilities],
          },
        ],
      },
    } as Exemption;
    processExemptions(mockExemption);
    processExemptions(mockExemption3);
    expect(Store.getItem(Policy.DisallowPrivileged)).toEqual(
      `[${JSON.stringify(storedControllerMatcher)}]`,
    );
    expect(Store.getItem(Policy.DropAllCapabilities)).toEqual(
      `[${JSON.stringify(storedControllerMatcher)}]`,
    );
  });

  it("Removes exemptions when CR is deleted", () => {
    processExemptions(mockExemption);
    removeExemptions(mockExemption);
    expect(Store.getItem(Policy.DisallowPrivileged)).toEqual("[]");
    expect(Store.getItem(Policy.DropAllCapabilities)).toEqual("[]");
  });
});
