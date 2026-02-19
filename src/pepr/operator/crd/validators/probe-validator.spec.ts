/**
 * Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { PeprValidateRequest } from "pepr";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PrometheusProbe } from "..";
import { probeValidator } from "./probe-validator";

function makeMockReq({ namespace = "test-ns", module }: { namespace?: string; module?: string }) {
  return {
    Raw: {
      metadata: { namespace },
      spec: { module },
    },
    Approve: vi.fn(),
    Deny: vi.fn(),
  } as unknown as PeprValidateRequest<PrometheusProbe>;
}

describe("probeValidator", () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it("approves when no module is specified", async () => {
    const req = makeMockReq({});
    await probeValidator(req);
    expect(req.Approve).toHaveBeenCalledTimes(1);
    expect(req.Deny).not.toHaveBeenCalled();
  });

  it("approves when module is the standard http_2xx module", async () => {
    const req = makeMockReq({ module: "http_2xx" });
    await probeValidator(req);
    expect(req.Approve).toHaveBeenCalledTimes(1);
    expect(req.Deny).not.toHaveBeenCalled();
  });

  it("approves when module matches the probe's own namespace prefix", async () => {
    const req = makeMockReq({
      namespace: "my-ns",
      module: "http_200x_sso_my-ns_uds-app-probe",
    });
    await probeValidator(req);
    expect(req.Approve).toHaveBeenCalledTimes(1);
    expect(req.Deny).not.toHaveBeenCalled();
  });

  it("denies when module references a different namespace", async () => {
    const req = makeMockReq({
      namespace: "attacker-ns",
      module: "http_200x_sso_victim-ns_uds-app-probe",
    });
    await probeValidator(req);
    expect(req.Deny).toHaveBeenCalledWith(
      "Probe is not authorized to use this Blackbox Exporter module",
    );
    expect(req.Approve).not.toHaveBeenCalled();
  });

  it("denies when module starts with http_200x_sso but has no namespace segment", async () => {
    const req = makeMockReq({
      namespace: "my-ns",
      module: "http_200x_sso",
    });
    await probeValidator(req);
    expect(req.Deny).toHaveBeenCalledWith(
      "Probe is not authorized to use this Blackbox Exporter module",
    );
  });

  it("denies when namespace is a prefix of another namespace in the module", async () => {
    // namespace "ns" should not match module "http_200x_sso_ns-extra_client"
    const req = makeMockReq({
      namespace: "ns",
      module: "http_200x_sso_ns-extra_client",
    });
    await probeValidator(req);
    expect(req.Deny).toHaveBeenCalledWith(
      "Probe is not authorized to use this Blackbox Exporter module",
    );
  });

  it("approves non-SSO custom modules without restriction", async () => {
    const req = makeMockReq({ module: "custom_module_name" });
    await probeValidator(req);
    expect(req.Approve).toHaveBeenCalledTimes(1);
    expect(req.Deny).not.toHaveBeenCalled();
  });
});
