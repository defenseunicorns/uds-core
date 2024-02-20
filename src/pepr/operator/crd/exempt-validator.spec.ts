import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { ExemptionElement, Policy } from "./generated/exemption-v1alpha1";
import { PeprValidateRequest } from "pepr";
import { UDSExemption } from ".";
import { exemptValidator } from "./exempt-validator";
import { UDSConfig } from "../../config";

type mockReqArgs = {
  ns?: string;
  exempts?: ExemptionElement[] | [];
};

const mockExemptions = [
  {
    policies: [Policy.DisallowPrivileged],
    matcher: {
      name: "^neuvector-enforcer-pod.*",
      namespace: "neuvector",
    },
  },
];

const makeMockReq = ({ ns = "uds-policy-exemptions", exempts = mockExemptions }: mockReqArgs) => {
  return {
    Raw: {
      metadata: {
        namespace: ns,
      },
      spec: {
        exemptions: exempts,
      },
    },
    Approve: jest.fn(),
    Deny: jest.fn(),
  } as unknown as PeprValidateRequest<UDSExemption>;
};

describe("Test validation of Exemption CRs", () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  it("allows default namespace", async () => {
    const mockReq = makeMockReq({});
    await exemptValidator(mockReq);
    expect(mockReq.Approve).toHaveBeenCalledTimes(1);
  });

  it("denies non default namespace if allow all === false", async () => {
    const mockReq = makeMockReq({ ns: "neuvector" });
    await exemptValidator(mockReq);
    expect(mockReq.Deny).toHaveBeenCalledTimes(1);
    expect(mockReq.Deny).toHaveBeenCalledWith(
      `Invalid namespace "${mockReq.Raw.metadata?.namespace}": must be "uds-policy-exemptions"`,
    );
  });

  it("allows all namespaces", async () => {
    UDSConfig.allowAllNSExemptions = true;
    const mockReq = makeMockReq({ ns: "neuvector" });
    await exemptValidator(mockReq);
    expect(mockReq.Approve).toHaveBeenCalledTimes(1);
  });

  it("checks for at least 1 exemption block", async () => {
    const mockReq = makeMockReq({ exempts: [] });
    await exemptValidator(mockReq);
    expect(mockReq.Deny).toHaveBeenLastCalledWith(
      "Invalid number of exemptions: must have at least 1",
    );
  });

  it("validates regex patterns in matchers", async () => {
    const mockReq = makeMockReq({
      exempts: [
        {
          ...mockExemptions[0],
          matcher: { ...mockExemptions[0].matcher, name: ")^neuvector-enforcer-pod*" },
        },
      ],
    });
    await exemptValidator(mockReq);
    expect(mockReq.Deny).toHaveBeenCalledWith(
      `Invalid regular expression pattern )^neuvector-enforcer-pod*: SyntaxError: Invalid regular expression: /)^neuvector-enforcer-pod*/: Unmatched ')'`,
    );
  });
});
