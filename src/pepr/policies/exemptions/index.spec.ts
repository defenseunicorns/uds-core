import { beforeAll, describe, expect, it, jest } from "@jest/globals";
import { isExempt } from ".";
import { PeprValidateRequest } from "pepr";
import { kind } from "pepr";
import { Policy } from "../../operator/crd";
import { Store } from "../common";

describe("test registering exemptions", () => {
  beforeAll(() => {
    jest
      .spyOn(Store, "getItem")
      .mockReturnValue('[{"namespace": "neuvector", "name": "^neuvector-enforcer-pod-.*"}]');
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
