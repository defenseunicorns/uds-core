/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { kind } from "pepr";

import { beforeEach, describe, expect, it, vi } from "vitest";
import { UDSPackage } from "../../crd";
import { UDSConfig } from "../config/config";
import {
  caBundleConfigMap,
  updateAllCaBundleConfigMaps,
  CA_BUNDLE_CONFIGMAP_LABEL,
} from "./ca-bundle";
import { getOwnerRef, purgeOrphans } from "../utils";

// Mock dependencies
const mockK8sApply = vi.fn();
const mockK8sGet = vi.fn();
const mockWithLabelGet = vi.fn();

// Create a mock for the log functions
const mockLog = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock("../utils", () => ({
  getOwnerRef: vi.fn(),
  purgeOrphans: vi.fn(),
}));

vi.mock("../../../logger", () => ({
  Component: {
    OPERATOR_CA_BUNDLE: "operator-ca-bundle",
  },
  setupLogger: vi.fn(() => mockLog),
}));

vi.mock("pepr", async importOriginal => {
  const actual: typeof import("pepr") = await importOriginal();
  return {
    ...actual,
    K8s: vi.fn().mockImplementation(resourceKind => {
      if (resourceKind === actual.kind.ConfigMap) {
        return {
          Apply: mockK8sApply,
          Get: mockK8sGet,
          WithLabel: vi.fn().mockReturnValue({
            Get: mockWithLabelGet,
          }),
        };
      }
    }),
  };
});

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

const validCertBase64 = btoa(validCert);
const dodCerts = "DoD CA Certs content";
const publicCerts = "Public CA Certs content";

const mockPackage: UDSPackage = {
  metadata: {
    name: "test-package",
    generation: 1,
  },
  spec: {
    caBundle: {
      configMap: {
        name: "custom-ca-bundle",
        key: "custom-ca-bundle.pem",
        labels: { "custom-label": "value" },
        annotations: { "custom-annotation": "value" },
      },
    },
  },
};

const mockOwnerRefs = [
  {
    apiVersion: "uds.dev/v1alpha1",
    kind: "Package",
    name: "test-package",
    uid: "test-uid",
  },
];

describe("CA Bundle ConfigMap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getOwnerRef).mockReturnValue(mockOwnerRefs);
    vi.mocked(purgeOrphans).mockResolvedValue();
    mockK8sApply.mockResolvedValue({});
    mockLog.warn.mockClear();

    // Reset UDSConfig
    UDSConfig.caBundle.certs = "";
    UDSConfig.caBundle.includeDoDCerts = false;
    UDSConfig.caBundle.includePublicCerts = false;
    UDSConfig.caBundle.dodCerts = "";
    UDSConfig.caBundle.publicCerts = "";
  });

  describe("caBundleConfigMap", () => {
    it("creates ConfigMap with default values when no caBundle config provided", async () => {
      const pkgWithoutCaBundle: UDSPackage = {
        metadata: {
          name: "test-package",
          generation: 1,
        },
        spec: {},
      };

      await caBundleConfigMap(pkgWithoutCaBundle, "test-namespace");

      expect(mockK8sApply).toHaveBeenCalledWith(
        {
          apiVersion: "v1",
          kind: "ConfigMap",
          metadata: {
            name: "uds-trust-bundle",
            namespace: "test-namespace",
            labels: {
              "uds/package": "test-package",
              "uds/generation": "1",
              [CA_BUNDLE_CONFIGMAP_LABEL]: "true",
            },
            annotations: {},
            ownerReferences: mockOwnerRefs,
          },
          data: {
            "ca-bundle.pem": "",
          },
        },
        { force: true },
      );

      expect(purgeOrphans).toHaveBeenCalledWith(
        "1",
        "test-namespace",
        "test-package",
        kind.ConfigMap,
        expect.any(Object),
        { [CA_BUNDLE_CONFIGMAP_LABEL]: "true" },
      );
    });

    it("creates ConfigMap with custom configuration", async () => {
      UDSConfig.caBundle.certs = validCertBase64;

      await caBundleConfigMap(mockPackage, "test-namespace");

      expect(mockK8sApply).toHaveBeenCalledWith(
        {
          apiVersion: "v1",
          kind: "ConfigMap",
          metadata: {
            name: "custom-ca-bundle",
            namespace: "test-namespace",
            labels: {
              "uds/package": "test-package",
              "uds/generation": "1",
              [CA_BUNDLE_CONFIGMAP_LABEL]: "true",
              "custom-label": "value",
            },
            annotations: {
              "custom-annotation": "value",
            },
            ownerReferences: mockOwnerRefs,
          },
          data: {
            "custom-ca-bundle.pem": validCert,
          },
        },
        { force: true },
      );
    });

    it("creates ConfigMap with combined certificate bundle", async () => {
      UDSConfig.caBundle.certs = validCertBase64;
      UDSConfig.caBundle.includeDoDCerts = true;
      UDSConfig.caBundle.includePublicCerts = true;
      UDSConfig.caBundle.dodCerts = btoa(dodCerts);
      UDSConfig.caBundle.publicCerts = btoa(publicCerts);

      await caBundleConfigMap(mockPackage, "test-namespace");

      const expectedCombinedCerts = [validCert, dodCerts, publicCerts].join("\n\n");

      expect(mockK8sApply).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            "custom-ca-bundle.pem": expectedCombinedCerts,
          },
        }),
        { force: true },
      );
    });

    it("throws error when K8s apply fails", async () => {
      mockK8sApply.mockRejectedValue(new Error("K8s apply failed"));

      await expect(caBundleConfigMap(mockPackage, "test-namespace")).rejects.toThrow(
        /Failed to process CA Bundle ConfigMap for test-package/,
      );
    });

    it("handles undefined package generation", async () => {
      const pkgWithoutGeneration: UDSPackage = {
        metadata: {
          name: "test-package",
        },
        spec: {},
      };

      await caBundleConfigMap(pkgWithoutGeneration, "test-namespace");

      expect(mockK8sApply).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            labels: expect.objectContaining({
              "uds/generation": "0",
            }),
          }),
        }),
        { force: true },
      );
    });
  });

  describe("buildCABundleContent", () => {
    it("returns empty string when no certificates are available", async () => {
      await caBundleConfigMap(mockPackage, "test-namespace");

      expect(mockK8sApply).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            "custom-ca-bundle.pem": "",
          },
        }),
        { force: true },
      );
    });

    it("includes only user certs when available", async () => {
      UDSConfig.caBundle.certs = validCertBase64;

      await caBundleConfigMap(mockPackage, "test-namespace");

      expect(mockK8sApply).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            "custom-ca-bundle.pem": validCert,
          },
        }),
        { force: true },
      );
    });

    it("includes only DoD certs when includeDoDCerts is true", async () => {
      UDSConfig.caBundle.includeDoDCerts = true;
      UDSConfig.caBundle.dodCerts = btoa(dodCerts);

      await caBundleConfigMap(mockPackage, "test-namespace");

      expect(mockK8sApply).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            "custom-ca-bundle.pem": dodCerts,
          },
        }),
        { force: true },
      );
    });

    it("includes only public certs when includePublicCerts is true", async () => {
      UDSConfig.caBundle.includePublicCerts = true;
      UDSConfig.caBundle.publicCerts = btoa(publicCerts);

      await caBundleConfigMap(mockPackage, "test-namespace");

      expect(mockK8sApply).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            "custom-ca-bundle.pem": publicCerts,
          },
        }),
        { force: true },
      );
    });

    it("skips DoD certs when includeDoDCerts is false even if dodCerts is set", async () => {
      UDSConfig.caBundle.includeDoDCerts = false;
      UDSConfig.caBundle.dodCerts = btoa(dodCerts);
      UDSConfig.caBundle.certs = validCertBase64;

      await caBundleConfigMap(mockPackage, "test-namespace");

      expect(mockK8sApply).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            "custom-ca-bundle.pem": validCert,
          },
        }),
        { force: true },
      );
    });

    it("skips public certs when includePublicCerts is false even if publicCerts is set", async () => {
      UDSConfig.caBundle.includePublicCerts = false;
      UDSConfig.caBundle.publicCerts = btoa(publicCerts);
      UDSConfig.caBundle.certs = validCertBase64;

      await caBundleConfigMap(mockPackage, "test-namespace");

      expect(mockK8sApply).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            "custom-ca-bundle.pem": validCert,
          },
        }),
        { force: true },
      );
    });

    it("handles empty base64 decoded certificates gracefully", async () => {
      UDSConfig.caBundle.certs = btoa(""); // empty string base64 encoded
      UDSConfig.caBundle.includeDoDCerts = true;
      UDSConfig.caBundle.dodCerts = btoa(""); // empty string base64 encoded

      await caBundleConfigMap(mockPackage, "test-namespace");

      expect(mockK8sApply).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            "custom-ca-bundle.pem": "",
          },
        }),
        { force: true },
      );
    });

    it("handles invalid base64 data gracefully", async () => {
      // Set invalid base64 data that will cause atob() to throw
      UDSConfig.caBundle.certs = "invalid-base64-data-!@#$%^&*()";

      await expect(caBundleConfigMap(mockPackage, "test-namespace")).rejects.toThrow(
        /Failed to process CA Bundle ConfigMap for test-package/,
      );
    });
  });

  describe("updateAllCaBundleConfigMaps", () => {
    beforeEach(() => {
      mockWithLabelGet.mockResolvedValue({
        items: [
          {
            metadata: {
              name: "configmap1",
              namespace: "namespace1",
            },
            data: {
              "ca-bundle.pem": "old-cert-content",
            },
          },
          {
            metadata: {
              name: "configmap2",
              namespace: "namespace2",
            },
            data: {
              "trust-bundle.pem": "old-cert-content",
            },
          },
        ],
      });
    });

    it("updates all CA bundle ConfigMaps with new content", async () => {
      UDSConfig.caBundle.certs = validCertBase64;

      await updateAllCaBundleConfigMaps();

      expect(mockWithLabelGet).toHaveBeenCalled();

      expect(mockK8sApply).toHaveBeenCalledTimes(2);

      // First ConfigMap update
      expect(mockK8sApply).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            name: "configmap1",
            namespace: "namespace1",
            managedFields: undefined,
          }),
          data: {
            "ca-bundle.pem": validCert,
          },
        }),
        { force: true },
      );

      // Second ConfigMap update
      expect(mockK8sApply).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            name: "configmap2",
            namespace: "namespace2",
            managedFields: undefined,
          }),
          data: {
            "trust-bundle.pem": validCert,
          },
        }),
        { force: true },
      );
    });

    it("updates ConfigMaps with empty content when no certs available", async () => {
      await updateAllCaBundleConfigMaps();

      expect(mockK8sApply).toHaveBeenCalledTimes(2);

      expect(mockK8sApply).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            "ca-bundle.pem": "",
          },
        }),
        { force: true },
      );

      expect(mockK8sApply).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            "trust-bundle.pem": "",
          },
        }),
        { force: true },
      );
    });

    it("returns early when no CA bundle ConfigMaps exist", async () => {
      mockWithLabelGet.mockResolvedValue({ items: [] });

      await updateAllCaBundleConfigMaps();

      expect(mockK8sApply).not.toHaveBeenCalled();
    });

    it("returns early when items is undefined", async () => {
      mockWithLabelGet.mockResolvedValue({});

      await updateAllCaBundleConfigMaps();

      expect(mockK8sApply).not.toHaveBeenCalled();
    });

    it("throws error when K8s operations fail", async () => {
      mockWithLabelGet.mockRejectedValue(new Error("K8s get failed"));

      await expect(updateAllCaBundleConfigMaps()).rejects.toThrow(
        /Failed to update CA bundle ConfigMaps globally/,
      );
    });

    it("throws error when Apply fails for a ConfigMap", async () => {
      mockK8sApply.mockRejectedValue(new Error("K8s apply failed"));

      await expect(updateAllCaBundleConfigMaps()).rejects.toThrow(
        /Failed to update CA bundle ConfigMaps globally/,
      );
    });

    it("updates ConfigMaps with combined certificate content", async () => {
      UDSConfig.caBundle.certs = validCertBase64;
      UDSConfig.caBundle.includeDoDCerts = true;
      UDSConfig.caBundle.includePublicCerts = true;
      UDSConfig.caBundle.dodCerts = btoa(dodCerts);
      UDSConfig.caBundle.publicCerts = btoa(publicCerts);

      await updateAllCaBundleConfigMaps();

      const expectedCombinedCerts = [validCert, dodCerts, publicCerts].join("\n\n");

      expect(mockK8sApply).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            "ca-bundle.pem": expectedCombinedCerts,
          },
        }),
        { force: true },
      );

      expect(mockK8sApply).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            "trust-bundle.pem": expectedCombinedCerts,
          },
        }),
        { force: true },
      );
    });

    it("skips ConfigMaps with no data keys and continues processing others", async () => {
      mockWithLabelGet.mockResolvedValue({
        items: [
          {
            metadata: {
              name: "configmap-no-data",
              namespace: "namespace1",
            },
            data: {}, // ConfigMap with no data keys
          },
          {
            metadata: {
              name: "configmap-with-data",
              namespace: "namespace2",
            },
            data: {
              "ca-bundle.pem": "old-cert-content",
            },
          },
        ],
      });

      UDSConfig.caBundle.certs = validCertBase64;

      await updateAllCaBundleConfigMaps();

      // Should warn about the ConfigMap with no data
      expect(mockLog.warn).toHaveBeenCalledWith(
        "No suitable key found in ConfigMap configmap-no-data, skipping update",
      );

      // Should only apply to the ConfigMap with data (1 call, not 2)
      expect(mockK8sApply).toHaveBeenCalledTimes(1);
      expect(mockK8sApply).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            name: "configmap-with-data",
            namespace: "namespace2",
          }),
          data: {
            "ca-bundle.pem": validCert,
          },
        }),
        { force: true },
      );
    });

    it("skips ConfigMaps when content is unchanged", async () => {
      UDSConfig.caBundle.certs = validCertBase64;

      mockWithLabelGet.mockResolvedValue({
        items: [
          {
            metadata: {
              name: "configmap-unchanged",
              namespace: "namespace1",
            },
            data: {
              "ca-bundle.pem": validCert, // Same content as the new content
            },
          },
          {
            metadata: {
              name: "configmap-changed",
              namespace: "namespace2",
            },
            data: {
              "ca-bundle.pem": "old-cert-content", // Different content
            },
          },
        ],
      });

      await updateAllCaBundleConfigMaps();

      // Should debug log about unchanged content
      expect(mockLog.debug).toHaveBeenCalledWith(
        "CA bundle content unchanged in ConfigMap configmap-unchanged, skipping update",
      );

      // Should only apply to the ConfigMap with changed content (1 call, not 2)
      expect(mockK8sApply).toHaveBeenCalledTimes(1);
      expect(mockK8sApply).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            name: "configmap-changed",
            namespace: "namespace2",
          }),
          data: {
            "ca-bundle.pem": validCert,
          },
        }),
        { force: true },
      );
    });
  });
});
