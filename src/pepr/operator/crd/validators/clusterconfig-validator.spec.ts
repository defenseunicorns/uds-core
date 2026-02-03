/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { PeprValidateRequest } from "pepr";
import { describe, expect, it, vi } from "vitest";
import { ClusterConfig, Name } from "../generated/clusterconfig-v1alpha1.js";
import { validateCfg, validateCfgUpdate } from "./clusterconfig-validator.js";

const validCert = `-----BEGIN CERTIFICATE-----
MIIDTDCCAjSgAwIBAgIId3cGJyapsXwwDQYJKoZIhvcNAQELBQAwRDELMAkGA1UE
BhMCVVMxFDASBgNVBAoMC0FmZmlybVRydXN0MR8wHQYDVQQDDBZBZmZpcm1UcnVz
dCBDb21tZXJjaWFsMB4XDTEwMDEyOTE0MDYwNloXDTMwMTIzMTE0MDYwNlowRDEL
MAkGA1UEBhMCVVMxFDASBgNVBAoMC0FmZmlybVRydXN0MR8wHQYDVQQDDBZBZmZp
cm1UcnVzdCBDb21tZXJjaWFsMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKC
AQEA9htPZwcroRX1BiLLHwGy43NFBkRJLLtJJRTWzsO3qyxPxkEylFf6EqdbDuKP
Hx6GGaeqtS25Xw2Kwq+FNXkyLbscYjfysVtKPcrNcV/pQr6U6Mje+SJIZMblq8Yr
ba0F8PrVC8+a5fBQpIs7R6UjW3p6+DM/uO+Zl+MgwdYoic+U+7lF7eNAFxHUdPAL
MeIrJmqbTFeurCA+ukV6BfO9m2kVrn1OIGPENXY6BwLJN/3HR+7o8XYdcxXyl6S1
yHp52UKqK39c/s4mT6NmgTWvRLpUHhwwMmWd5jyTXlBOeuM61G7MGvv50jeuJCqr
VwMiKA1JdX+3KNp1v47j3A55MQIDAQABo0IwQDAdBgNVHQ4EFgQUnZPGU4teyq8/
nx4P5ZmVvCT2lI8wDwYDVR0TAQH/BAUwAwEB/zAOBgNVHQ8BAf8EBAMCAQYwDQYJ
KoZIhvcNAQELBQADggEBAFis9AQOzcAN/wr91LoWXym9e2iZWEnStB03TX8nfUYG
XUPGhi4+c7ImfU+TqbbEKpqrIZcUsd6M06uJFdhrJNTxFq7YpFzUf1GO7RgBsZNj
vbz4YYCanrHOQnDiqX0GJX0nof5v7LMeJNrjS1UaADs1tDvZ110w/YETifLCBivt
Z8SOyUOyXGsViQK8YvxO8rUzqrJv0wqiUOP2O+guRMLbZjipM1ZI8W0bM40NjD9g
N53Tym1+NH4Nn3J2ixufcv1SNUFFApYvHLKac0khsUlHRUe072o0EclNmsxZt9YC
nlpOZbWUrhvfKbAW8b8Angc6F2S1BLUjIZkKlTuXfO8=
-----END CERTIFICATE-----`;

const mockCfg: ClusterConfig = {
  metadata: {
    name: Name.UdsClusterConfig,
  },
  spec: {
    caBundle: {
      certs: btoa(validCert),
      includeDoDCerts: false,
      includePublicCerts: false,
    },
    expose: {
      domain: "mock-domain",
      adminDomain: "mock-admin-domain",
    },
    networking: {
      kubeApiCIDR: "mock-cidr",
      kubeNodeCIDRs: ["mock-node-cidrs"],
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

  it("throws error for invalid base64 caBundle.certs", () => {
    const invalidCaBundle = {
      ...mockCfg,
      spec: {
        ...mockCfg.spec!,
        caBundle: { ...mockCfg.spec!.caBundle, certs: "invalid-base64" },
      },
    };
    expect(() => validateCfg(invalidCaBundle)).toThrowError(
      "ClusterConfig: caBundle.certs must be base64 encoded; found invalid value",
    );
  });

  it("throws error for base64 encoded but invalid certificate", () => {
    const invalidCert = btoa("invalid-certificate-data");
    const invalidCaBundle = {
      ...mockCfg,
      spec: {
        ...mockCfg.spec!,
        caBundle: { ...mockCfg.spec!.caBundle, certs: invalidCert },
      },
    };
    expect(() => validateCfg(invalidCaBundle)).toThrowError(
      "ClusterConfig: No valid certificates found in bundle",
    );
  });

  it("throws error for malformed certificate in bundle", () => {
    const malformedCert = `-----BEGIN CERTIFICATE-----
invalid-cert-data
-----END CERTIFICATE-----`;
    const invalidCaBundle = {
      ...mockCfg,
      spec: {
        ...mockCfg.spec!,
        caBundle: { ...mockCfg.spec!.caBundle, certs: btoa(malformedCert) },
      },
    };
    expect(() => validateCfg(invalidCaBundle)).toThrowError(
      /ClusterConfig: Invalid certificate at index 0:/,
    );
  });

  it("does not throw error if caBundle.certs is set to ###ZARF_VAR_CA_BUNDLE_CERTS###", () => {
    const defaultCaBundle = {
      ...mockCfg,
      spec: {
        ...mockCfg.spec!,
        caBundle: {
          ...mockCfg.spec!.caBundle,
          certs: "###ZARF_VAR_CA_BUNDLE_CERTS###",
        },
      },
    };
    expect(() => validateCfg(defaultCaBundle)).not.toThrowError();
  });

  it("does not throw error if caBundle.certs is set to ###ZARF_VAR_CA_CERT###", () => {
    const defaultCaBundle = {
      ...mockCfg,
      spec: {
        ...mockCfg.spec!,
        caBundle: {
          ...mockCfg.spec!.caBundle,
          certs: "###ZARF_VAR_CA_CERT###",
        },
      },
    };
    expect(() => validateCfg(defaultCaBundle)).not.toThrowError();
  });

  it("validates multiple certificates in bundle", () => {
    const multipleCerts = validCert + "\n" + validCert;
    const validMultipleCaBundle = {
      ...mockCfg,
      spec: {
        ...mockCfg.spec!,
        caBundle: { ...mockCfg.spec!.caBundle, certs: btoa(multipleCerts) },
      },
    };
    expect(() => validateCfg(validMultipleCaBundle)).not.toThrowError();
  });

  it("allows empty caBundle.certs", () => {
    const emptyCaBundle = {
      ...mockCfg,
      spec: {
        ...mockCfg.spec!,
        caBundle: { ...mockCfg.spec!.caBundle, certs: undefined },
      },
    };
    expect(() => validateCfg(emptyCaBundle)).not.toThrowError();
  });
});

describe("ClusterConfig Update validation", () => {
  const makeMockReq = (cfg: ClusterConfig = mockCfg) => {
    return {
      Raw: cfg,
      Approve: vi.fn(),
      Deny: vi.fn(),
    } as unknown as PeprValidateRequest<ClusterConfig>;
  };

  it("validate a valid ClusterConfig", async () => {
    const req = makeMockReq();
    await validateCfgUpdate(req);
    expect(req.Approve).toHaveBeenCalledTimes(1);
  });

  it("denies request on invalid ClusterConfig caBundle.certs", async () => {
    const invalidCaBundle = {
      ...mockCfg,
      spec: {
        ...mockCfg.spec!,
        caBundle: { ...mockCfg.spec!.caBundle, certs: "invalid-base64" },
      },
    };
    const req = makeMockReq(invalidCaBundle);
    await validateCfgUpdate(req);
    expect(req.Deny).toHaveBeenCalledWith(
      "Validation failed: ClusterConfig: caBundle.certs must be base64 encoded; found invalid value",
    );
  });

  it("denies request on malformed certificate in bundle", async () => {
    const malformedCert = `-----BEGIN CERTIFICATE-----
invalid-cert-data
-----END CERTIFICATE-----`;
    const invalidCaBundle = {
      ...mockCfg,
      spec: {
        ...mockCfg.spec!,
        caBundle: { ...mockCfg.spec!.caBundle, certs: btoa(malformedCert) },
      },
    };
    const req = makeMockReq(invalidCaBundle);
    await validateCfgUpdate(req);
    expect(req.Deny).toHaveBeenCalledWith(
      expect.stringMatching(/Validation failed: ClusterConfig: Invalid certificate at index 0:/),
    );
  });
});
