import { beforeAll, describe, expect, it, jest } from "@jest/globals";
import { PeprValidateRequest, kind } from "pepr";
import { isExempt } from ".";
import { ExemptionStore } from "../../operator/controllers/exemptions/exemption-store";
import { MatcherKind, Policy } from "../../operator/crd";

describe("test registering exemptions", () => {
  beforeAll(() => {
    ExemptionStore.init();
    jest.spyOn(ExemptionStore, "getByPolicy").mockReturnValue([
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
          name: "vector",
          namespace: "monitoring",
        },
      },
    } as unknown as PeprValidateRequest<kind.Pod>;
    const exempt = isExempt(req, Policy.DisallowPrivileged);
    expect(exempt).toBe(false);
  });
});
