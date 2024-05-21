import { beforeAll, describe, expect, it, jest } from "@jest/globals";
import { PeprValidateRequest, kind } from "pepr";
import { isExempt } from ".";
import {
  initPolicyMap,
  policyExemptionMap,
} from "../../operator/controllers/exemptions/exemption-store";
import { MatcherKind, Policy } from "../../operator/crd";

describe("test registering exemptions", () => {
  beforeAll(() => {
    initPolicyMap();
    jest.spyOn(policyExemptionMap, "get").mockReturnValue([
      {
        namespace: "neuvector",
        name: "^neuvector-enforcer-pod-.*",
        kind: MatcherKind.Pod,
        owner: "uid",
      },
    ]);
  });

  it("should be exempt", () => {
    const req = {
      Raw: {
        metadata: {
          name: "neuvector-enforcer-pod-x",
          namespace: "neuvector",
        },
      },
    } as unknown as PeprValidateRequest<kind.Pod>;
    const exempt = isExempt(req, Policy.DisallowPrivileged);
    expect(exempt).toBe(true);
  });

  it("should not be exempt", () => {
    const req = {
      Raw: {
        metadata: {
          name: "promtail",
          namespace: "monitoring",
        },
      },
    } as unknown as PeprValidateRequest<kind.Pod>;
    const exempt = isExempt(req, Policy.DisallowPrivileged);
    expect(exempt).toBe(false);
  });
});
