import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { Store } from "../../../policies/common";
import { processExemptions, removeExemptions } from "./exemptions";
import { Policy } from "../../crd";
import { Exemption } from "../../crd/generated/exemption-v1alpha1";

const mockStore = new Map<string, string>();
const enforcerMatcher = { namespace: "neuvector", name: "^neuvector-enforcer-pod.*" };
const controllerMatcher = { namespace: "neuvector", name: "^neuvector-controller-pod.*" };
const prometheusMatcher = { namespace: "neuvector", name: "^neuvector-prometheus-exporter-pod.*" };
const mockExemption = {
  spec: {
    exemptions: [
      {
        matcher: enforcerMatcher,
        policies: ["Disallow_Privileged", "Drop_All_Capabilities"],
      },
      {
        matcher: controllerMatcher,
        policies: ["Disallow_Privileged", "Drop_All_Capabilities"],
      },
      {
        matcher: prometheusMatcher,
        policies: ["Drop_All_Capabilities"],
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
      `[${JSON.stringify(enforcerMatcher)},${JSON.stringify(controllerMatcher)}]`,
    );
    expect(Store.getItem(Policy.DropAllCapabilities)).toEqual(
      `[${JSON.stringify(enforcerMatcher)},${JSON.stringify(controllerMatcher)},${JSON.stringify(
        prometheusMatcher,
      )}]`,
    );
  });

  it("Tries to add same exemptions again and doesn't", async () => {
    processExemptions(mockExemption);
    processExemptions(mockExemption);
    expect(Store.getItem(Policy.DisallowPrivileged)).toEqual(
      `[${JSON.stringify(enforcerMatcher)},${JSON.stringify(controllerMatcher)}]`,
    );
    expect(Store.getItem(Policy.DropAllCapabilities)).toEqual(
      `[${JSON.stringify(enforcerMatcher)},${JSON.stringify(controllerMatcher)},${JSON.stringify(
        prometheusMatcher,
      )}]`,
    );
  });

  it("Removes exemptions policies when CR updates", async () => {
    const mockExemption2 = {
      spec: {
        exemptions: [
          ...mockExemption.spec?.exemptions!,
          { matcher: enforcerMatcher, policies: ["Disallow_Privileged"] },
        ],
      },
    } as Exemption;
    processExemptions(mockExemption);
    expect(Store.getItem(Policy.DropAllCapabilities)).toEqual(
      `[${JSON.stringify(enforcerMatcher)},${JSON.stringify(controllerMatcher)},${JSON.stringify(
        prometheusMatcher,
      )}]`,
    );

    processExemptions(mockExemption2);
    expect(Store.getItem(Policy.DisallowPrivileged)).toEqual(
      `[${JSON.stringify(enforcerMatcher)},${JSON.stringify(controllerMatcher)}]`,
    );
    expect(Store.getItem(Policy.DropAllCapabilities)).toEqual(
      `[${JSON.stringify(controllerMatcher)},${JSON.stringify(prometheusMatcher)}]`,
    );
  });

  it('Removes matchers from policy if matcher removed from CR', () => {
    const mockExemption3 = {
      spec: {
        exemptions: [
          {
            matcher: controllerMatcher,
            policies: ["Disallow_Privileged", "Drop_All_Capabilities"],
          },
          {
            matcher: prometheusMatcher,
            policies: ["Drop_All_Capabilities"],
          },
        ],
      },
    } as Exemption;
    processExemptions(mockExemption)
    processExemptions(mockExemption3)
    expect(Store.getItem(Policy.DisallowPrivileged)).toEqual(`[${JSON.stringify(controllerMatcher)}]`)
    expect(Store.getItem(Policy.DropAllCapabilities)).toEqual(`[${JSON.stringify(controllerMatcher)},${JSON.stringify(prometheusMatcher)}]`)
  })

  it("Removes exemptions when CR is deleted", () => {
    processExemptions(mockExemption);
    removeExemptions(mockExemption);
    expect(Store.getItem(Policy.DisallowPrivileged)).toEqual("[]");
    expect(Store.getItem(Policy.DropAllCapabilities)).toEqual("[]");
  });
});
