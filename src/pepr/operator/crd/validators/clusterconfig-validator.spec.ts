import { describe, expect, it, jest } from "@jest/globals";
import { PeprValidateRequest } from "pepr";
import { ClusterConfig } from "../generated/clusterconfig-v1alpha1";
import { validateCfg, validateCfgUpdate } from "./clusterconfig-validator";

const mockCfg: ClusterConfig = {
  metadata: {
    name: "uds-cluster-config",
    namespace: "pepr-system",
  },
  spec: {
    expose: {
      domain: "mock-domain",
      adminDomain: "mock-admin-domain",
      caCert: btoa("mock-ca-cert"),
    },
    networking: {
      kubeapiCIDR: "mock-cidr",
      kubenodeCIDRS: ["mock-node-cidrs"],
    },
    policy: {
      allowAllNsExemptions: true,
    },
  },
};

describe("ClusterConfigValidator", () => {
  it("should validate a valid ClusterConfig", () => {
    expect(() => validateCfg(mockCfg)).not.toThrowError();
  });

  it("throws errors for wrong name", () => {
    const wrongNameCfg = { ...mockCfg, metadata: { name: "wrong-name", namespace: "pepr-system" } };
    expect(() => validateCfg(wrongNameCfg)).toThrowError(
      "ClusterConfig Validation: namespace or name is invalid",
    );
  });

  it("throws errors for wrong namespace", () => {
    const wrongNameCfg = {
      ...mockCfg,
      metadata: { name: "uds-cluster-config", namespace: "invalid" },
    };
    expect(() => validateCfg(wrongNameCfg)).toThrowError(
      "ClusterConfig Validation: namespace or name is invalid",
    );
  });

  it("throws errors for invalid caCert", () => {
    const invalidCaCert = {
      ...mockCfg,
      spec: { ...mockCfg.spec!, expose: { ...mockCfg.spec!.expose, caCert: "invalid" } },
    };
    expect(() => validateCfg(invalidCaCert)).toThrowError(
      "ClusterConfig Validation: caCert must be base64 encoded -- found invalid value",
    );
  });
});

describe("ClusterConfig Update validation", () => {
  const makeMockReq = (cfg: ClusterConfig = mockCfg) => {
    return {
      Raw: cfg,
      Approve: jest.fn(),
      Deny: jest.fn(),
    } as unknown as PeprValidateRequest<ClusterConfig>;
  };

  it("validate a valid ClusterConfig", async () => {
    const req = makeMockReq();
    await validateCfgUpdate(req);
    expect(req.Approve).toHaveBeenCalledTimes(1);
  });

  it("denies request on invalid ClusterConfig", async () => {
    const wrongNameCfg = {
      ...mockCfg,
      metadata: { name: "uds-cluster-config", namespace: "invalid" },
    };
    const req = makeMockReq(wrongNameCfg);
    await validateCfgUpdate(req);
    expect(req.Deny).toHaveBeenCalledWith(
      "Failed to validate UDSConfig update: Error: ClusterConfig Validation: namespace or name is invalid",
    );
  });
});
