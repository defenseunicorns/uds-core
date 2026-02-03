/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { PeprValidateRequest } from "pepr";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MatcherKind, UDSExemption } from "../index.js";

import { UDSConfig } from "../../controllers/config/config.js";
import { ExemptionElement, Policy } from "../generated/exemption-v1alpha1.js";
import { exemptValidator } from "./exempt-validator.js";

type mockReqArgs = {
  ns?: string;
  exempts?: ExemptionElement[] | [];
};

const mockExemptions = [
  {
    policies: [Policy.DisallowPrivileged],
    matcher: {
      name: "^falco-pod.*",
      namespace: "falco",
      kind: MatcherKind.Pod,
    },
  },
];

const makeMockReq = ({ ns = "uds-policy-exemptions", exempts = mockExemptions }: mockReqArgs) => {
  return {
    Raw: {
      metadata: {
        namespace: ns,
        name: "exemption",
      },
      spec: {
        exemptions: exempts,
      },
    },
    Approve: vi.fn(),
    Deny: vi.fn(),
  } as unknown as PeprValidateRequest<UDSExemption>;
};

describe("Test validation of Exemption CRs", () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it("allows default namespace", async () => {
    const mockReq = makeMockReq({});
    await exemptValidator(mockReq);
    expect(mockReq.Approve).toHaveBeenCalledTimes(1);
  });

  it("denies non default namespace if allow all === false", async () => {
    const mockReq = makeMockReq({ ns: "falco" });
    await exemptValidator(mockReq);
    expect(mockReq.Deny).toHaveBeenCalledTimes(1);
    expect(mockReq.Deny).toHaveBeenCalledWith(
      `Invalid namespace "${mockReq.Raw.metadata?.namespace}" for UDSExemption ${mockReq.Raw.metadata?.name}: must be "uds-policy-exemptions"`,
    );
  });

  it("allows all namespaces", async () => {
    UDSConfig.allowAllNSExemptions = true;
    const mockReq = makeMockReq({ ns: "falco" });
    await exemptValidator(mockReq);
    expect(mockReq.Approve).toHaveBeenCalledTimes(1);
  });

  it("denies matcher regex patterns with leading and trailing slashes", async () => {
    const wrongMatcherName = "/^falco-pod*/";
    const mockReq = makeMockReq({
      exempts: [
        {
          ...mockExemptions[0],
          matcher: { ...mockExemptions[0].matcher, name: wrongMatcherName },
        },
      ],
    });
    await exemptValidator(mockReq);
    expect(mockReq.Deny).toHaveBeenCalledWith(
      `Invalid matcher name "${wrongMatcherName}": please remove the leading and trailing slashes`,
    );
  });

  it("validates regex patterns in matchers", async () => {
    const mockReq = makeMockReq({
      exempts: [
        {
          ...mockExemptions[0],
          matcher: { ...mockExemptions[0].matcher, name: ")^falco-pod*" },
        },
      ],
    });
    await exemptValidator(mockReq);
    expect(mockReq.Deny).toHaveBeenCalledWith(
      `Invalid regular expression pattern )^falco-pod*: SyntaxError: Invalid regular expression: /)^falco-pod*/: Unmatched ')'`,
    );
  });

  it("allows correct kind for policies", async () => {
    const mockReq = makeMockReq({});
    await exemptValidator(mockReq);
    expect(mockReq.Approve).toHaveBeenCalled();
  });

  it("denies wrong kind for policies", async () => {
    const mockReq = makeMockReq({
      exempts: [
        {
          ...mockExemptions[0],
          matcher: { ...mockExemptions[0].matcher, kind: MatcherKind.Service },
        },
      ],
    });

    await exemptValidator(mockReq);
    expect(mockReq.Deny).toHaveBeenCalledWith(
      `Invalid kind "${MatcherKind.Service}" for matcher "${mockExemptions[0].matcher.name}" with policy "${mockExemptions[0].policies[0]}": "${mockExemptions[0].policies[0]}" can only be exempted for kind "${MatcherKind.Pod}"`,
    );
  });
});
