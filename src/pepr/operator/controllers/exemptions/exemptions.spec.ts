import { beforeEach, describe, expect, it } from "@jest/globals";
import { PolicyMap } from "../../../policies";
import { MatcherKind, Policy } from "../../crd";
import { Exemption } from "../../crd/generated/exemption-v1alpha1";
import { processExemptions } from "./exemptions";

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

describe("Test await processExemptions()", () => {
  beforeEach(() => {
    exemptionMap = new Map();
    const policyList = Object.values(Policy);
    for (const p of policyList) {
      exemptionMap.set(p, []);
    }
  });

  it("Add exemptions for the first time", async () => {
    processExemptions(neuvectorMockExemption, "ADDED", exemptionMap);
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

  it("Does not add duplicate matchers for same CR", async () => {
    processExemptions(neuvectorMockExemption, "ADDED", exemptionMap);
    processExemptions(neuvectorMockExemption, "ADDED", exemptionMap);
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

  it("Adds duplicate matchers if from separate CR", async () => {
    processExemptions(neuvectorMockExemption, "ADDED", exemptionMap);
    processExemptions(
      { ...neuvectorMockExemption, metadata: { uid: exemption2UID } },
      "ADDED",
      exemptionMap,
    );

    expect(exemptionMap.get(Policy.DisallowPrivileged)).toEqual([
      storedEnforcerMatcher,
      storedControllerMatcher,
      { ...storedEnforcerMatcher, owner: exemption2UID },
      {
        ...storedControllerMatcher,
        owner: exemption2UID,
      },
    ]);

    expect(exemptionMap.get(Policy.DropAllCapabilities)).toEqual([
      storedEnforcerMatcher,
      storedControllerMatcher,
      storedPrometheusMatcher,
      {
        ...storedEnforcerMatcher,
        owner: exemption2UID,
      },
      { ...storedControllerMatcher, owner: exemption2UID },
      {
        ...storedPrometheusMatcher,
        owner: exemption2UID,
      },
    ]);
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

      processExemptions(neuvectorMockExemption, "ADDED", exemptionMap);
      processExemptions(updatedNeuvectorExemption, "MODIFIED", exemptionMap);

      expect(exemptionMap.get(Policy.RequireNonRootUser)).toEqual([]);
      expect(exemptionMap.get(Policy.DisallowPrivileged)).toEqual(
        [storedEnforcerMatcher],
      );
      expect(exemptionMap.get(Policy.DropAllCapabilities)).toEqual(
        [storedControllerMatcher,storedPrometheusMatcher],
      );
    });

    it("Removes matchers from policy if matchers removed from CR", async () => {
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

      processExemptions(neuvectorMockExemption, "ADDED", exemptionMap);
      processExemptions(updatedNeuvectorExemption, "MODIFIED", exemptionMap);
      expect(exemptionMap.get(Policy.RequireNonRootUser)).toEqual([]);
      expect(exemptionMap.get(Policy.DisallowPrivileged)).toEqual(
        [storedControllerMatcher],
      );
      expect(exemptionMap.get(Policy.DropAllCapabilities)).toEqual(
        [storedControllerMatcher],
      );
      expect(exemptionMap.get(Policy.DisallowNodePortServices)).toEqual(
        [{ ...storedEnforcerMatcher, kind: MatcherKind.Service }],
      );
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

      processExemptions(neuvectorMockExemption2, "ADDED", exemptionMap);

      expect(exemptionMap.get(Policy.DisallowPrivileged)).toEqual(
        [storedEnforcerMatcher],
      );
      expect(exemptionMap.get(Policy.DropAllCapabilities)).toEqual(
        [storedEnforcerMatcher],
      );
      expect(exemptionMap.get(Policy.RequireNonRootUser)).toEqual(
        [storedEnforcerMatcher],
      );
      expect(exemptionMap.get(Policy.DisallowNodePortServices)).toEqual(
        [{ ...storedEnforcerMatcher, kind: MatcherKind.Service }],
      );
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

      processExemptions(neuvectorMockExemption2, "ADDED", exemptionMap);

      expect(exemptionMap.get(Policy.DisallowPrivileged)).toEqual(
        [storedEnforcerMatcher,{
          ...storedEnforcerMatcher,
          namespace: diffNS,
        }],
      );
      expect(exemptionMap.get(Policy.DropAllCapabilities)).toEqual(
        [storedEnforcerMatcher,{
          ...storedEnforcerMatcher,
          namespace: diffNS,
        }],
      );
      expect(exemptionMap.get(Policy.RequireNonRootUser)).toEqual(
        [storedEnforcerMatcher,{
          ...storedEnforcerMatcher,
          namespace: diffNS,
        }],
      );
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

      processExemptions(neuvectorMockExemption2, "ADDED", exemptionMap);

      expect(exemptionMap.get(Policy.DisallowPrivileged)).toEqual(
        [storedEnforcerMatcher,{
          ...storedEnforcerMatcher,
          namespace: diffNS,
        }],
      );
      expect(exemptionMap.get(Policy.DropAllCapabilities)).toEqual(
        [storedEnforcerMatcher],
      );
      expect(exemptionMap.get(Policy.RequireNonRootUser)).toEqual(
        [storedEnforcerMatcher],
      );
    });
  });

  describe("Test removeExemptions()", () => {
    beforeEach(() => {
       exemptionMap = new Map();
       const policyList = Object.values(Policy);
       for (const p of policyList) {
         exemptionMap.set(p, []);
       }
    });

    it("Removes all CRs exemptions when deleted", async () => {
      processExemptions(neuvectorMockExemption, "ADDED", exemptionMap);
      processExemptions(neuvectorMockExemption, "DELETED", exemptionMap);
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

      processExemptions(neuvectorMockExemption, "ADDED", exemptionMap);
      processExemptions(promtailMockExemption, "ADDED", exemptionMap);
      processExemptions(neuvectorMockExemption, "DELETED", exemptionMap);

      expect(exemptionMap.get(Policy.DisallowPrivileged)).toEqual(
        [storedPromtailMatcher],
      );
      expect(exemptionMap.get(Policy.DropAllCapabilities)).toEqual(
        [storedPromtailMatcher],
      );
      expect(exemptionMap.get(Policy.RequireNonRootUser)).toEqual(
        [storedPromtailMatcher],
      );
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

      processExemptions(neuvectorMockExemption2, "ADDED", exemptionMap);
      processExemptions(neuvectorDuplicatMockExemption, "ADDED", exemptionMap);
      processExemptions(neuvectorDuplicatMockExemption, "DELETED", exemptionMap);

      expect(exemptionMap.get(Policy.DisallowPrivileged)).toEqual(
        [storedEnforcerMatcher],
      );
      expect(exemptionMap.get(Policy.DropAllCapabilities)).toEqual(
        [storedEnforcerMatcher],
      );
      expect(exemptionMap.get(Policy.RequireNonRootUser)).toEqual(
        [storedEnforcerMatcher],
      );
    });
});
