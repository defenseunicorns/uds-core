import { describe, expect, it } from "@jest/globals";
import { registerExemptions } from ".";
import { PeprValidateRequest } from "pepr";
import { kind } from "pepr";

describe("test registering exemptions", () => {
  const exemptNeuvectorEnforcer = registerExemptions([
    { name: "^neuvector-enforcer-pod.*", namespace: "neuvector" },
  ]);

  it("should be exempt", () => {
    const isExempt = exemptNeuvectorEnforcer({
      Raw: {
        metadata: {
          name: "neuvector-enforcer-pod-x",
          namespace: "neuvector",
        },
      },
    } as unknown as PeprValidateRequest<kind.Pod>);
    expect(isExempt).toBe(true);
  });

  it("should not be exempt", () => {
    const isExempt = exemptNeuvectorEnforcer({
      Raw: {
        metadata: {
          name: "promtail",
          namespace: "monitoring",
        },
      },
    } as unknown as PeprValidateRequest<kind.Pod>);
    expect(isExempt).toBe(false);
  });
});
