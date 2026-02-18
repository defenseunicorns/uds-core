/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { UDSPackage } from "../../crd";
import { UDSConfig } from "../config/config";
import { getOwnerRef, purgeOrphans } from "../utils";
import {
  buildCABundleContent,
  CA_BUNDLE_CONFIGMAP_LABEL,
  caBundleConfigMap,
  updateAllCaBundleConfigMaps,
} from "./ca-bundle";

// Mock dependencies
const mockK8sApply = vi.fn();
const mockK8sGet = vi.fn();
const mockWithLabelGet = vi.fn();
const mockK8sDelete = vi.fn();
const mockUDSPackageGet = vi.fn();

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
  retryWithDelay: vi.fn(async (fn: () => Promise<unknown>) => fn()),
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
          InNamespace: vi.fn().mockReturnValue({
            WithLabel: vi.fn().mockReturnValue({
              WithLabel: vi.fn().mockReturnValue({
                Delete: mockK8sDelete,
              }),
            }),
          }),
          WithLabel: vi.fn().mockReturnValue({
            Get: mockWithLabelGet,
          }),
        };
      } else if (resourceKind === actual.kind.Namespace) {
        return {
          Apply: mockK8sApply,
        };
      } else if (resourceKind === actual.kind.Secret) {
        // Handle Secret operations
        return {
          Apply: mockK8sApply,
          InNamespace: vi.fn().mockReturnValue({
            Get: vi.fn().mockResolvedValue({
              metadata: { name: "test-secret", namespace: "test-ns" },
              data: {},
            }),
          }),
        };
      } else if (resourceKind === actual.kind.Pod) {
        // Handle Pod operations for reloadPods discovery
        return {
          InNamespace: vi.fn().mockReturnValue({
            WithLabel: vi.fn().mockReturnValue({
              Get: vi.fn().mockResolvedValue({
                items: [], // Return empty list to skip reload logic in tests
              }),
            }),
          }),
          WithLabel: vi.fn().mockReturnValue({
            Get: vi.fn().mockResolvedValue({
              items: [],
            }),
          }),
        };
      } else {
        // Handle UDSPackage and other resource types
        return {
          Get: mockUDSPackageGet,
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
    mockUDSPackageGet.mockResolvedValue({ items: [] });
    mockLog.warn.mockClear();

    // Reset UDSConfig
    UDSConfig.caBundle.certs = "";
    UDSConfig.caBundle.includeDoDCerts = false;
    UDSConfig.caBundle.includePublicCerts = false;
    UDSConfig.caBundle.dodCerts = "";
    UDSConfig.caBundle.publicCerts = "";

    // Set PEPR_WATCH_MODE to 'true' by default
    process.env.PEPR_WATCH_MODE = "true";
  });

  describe("caBundleConfigMap", () => {
    it("deletes existing ConfigMaps when no caBundle config provided", async () => {
      const pkgWithoutCaBundle: UDSPackage = {
        metadata: {
          name: "test-package",
          generation: 1,
        },
        spec: {},
      };

      await caBundleConfigMap(pkgWithoutCaBundle, "test-namespace");

      expect(mockK8sApply).not.toHaveBeenCalled();
      expect(mockK8sDelete).toHaveBeenCalled();
      expect(purgeOrphans).not.toHaveBeenCalled();
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

      expect(purgeOrphans).toHaveBeenCalledWith(
        "1",
        "test-namespace",
        "test-package",
        expect.anything(),
        expect.anything(),
        { [CA_BUNDLE_CONFIGMAP_LABEL]: "true" },
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

      expect(purgeOrphans).toHaveBeenCalledWith(
        "1",
        "test-namespace",
        "test-package",
        expect.anything(),
        expect.anything(),
        { [CA_BUNDLE_CONFIGMAP_LABEL]: "true" },
      );
    });

    it("throws error when K8s apply fails", async () => {
      UDSConfig.caBundle.certs = validCertBase64; // Ensure we have certs so Apply is called
      mockK8sApply.mockRejectedValue(new Error("K8s apply failed"));

      await expect(caBundleConfigMap(mockPackage, "test-namespace")).rejects.toThrow(
        /Failed to process CA Bundle ConfigMap for test-package/,
      );
    });

    it("handles undefined package generation", async () => {
      UDSConfig.caBundle.certs = validCertBase64; // Ensure we have certs so Apply is called
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

      expect(purgeOrphans).toHaveBeenCalledWith(
        "0",
        "test-namespace",
        "test-package",
        expect.anything(),
        expect.anything(),
        { [CA_BUNDLE_CONFIGMAP_LABEL]: "true" },
      );
    });
  });

  describe("buildCABundleContent", () => {
    beforeEach(() => {
      mockK8sDelete.mockResolvedValue({});
    });

    it("deletes existing ConfigMaps when no certificates are available", async () => {
      // Ensure no certificates are available
      UDSConfig.caBundle.certs = "";
      UDSConfig.caBundle.includeDoDCerts = false;
      UDSConfig.caBundle.includePublicCerts = false;

      await caBundleConfigMap(mockPackage, "test-namespace");

      expect(mockK8sApply).not.toHaveBeenCalled();
      expect(mockK8sDelete).toHaveBeenCalled();
      expect(purgeOrphans).not.toHaveBeenCalled();
    });

    it("handles delete errors gracefully when no ConfigMaps exist", async () => {
      // Ensure no certificates are available
      UDSConfig.caBundle.certs = "";
      UDSConfig.caBundle.includeDoDCerts = false;
      UDSConfig.caBundle.includePublicCerts = false;

      // Mock delete to throw an error (ConfigMap doesn't exist)
      mockK8sDelete.mockRejectedValue(new Error("ConfigMap not found"));

      await caBundleConfigMap(mockPackage, "test-namespace");

      expect(mockK8sApply).not.toHaveBeenCalled();
      expect(mockK8sDelete).toHaveBeenCalled();
      expect(purgeOrphans).not.toHaveBeenCalled();
      // Should not throw an error
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

    it("deletes ConfigMaps when certificates are empty after base64 decoding", async () => {
      UDSConfig.caBundle.certs = btoa(""); // empty string base64 encoded
      UDSConfig.caBundle.includeDoDCerts = true;
      UDSConfig.caBundle.dodCerts = btoa(""); // empty string base64 encoded

      await caBundleConfigMap(mockPackage, "test-namespace");

      expect(mockK8sApply).not.toHaveBeenCalled();
      expect(mockK8sDelete).toHaveBeenCalled();
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
    const mockPackages: UDSPackage[] = [
      {
        metadata: {
          name: "package1",
          namespace: "namespace1",
          generation: 1,
        },
        spec: {
          caBundle: {
            configMap: {
              name: "custom-ca-bundle-1",
              key: "ca-bundle.pem",
            },
          },
        },
      },
      {
        metadata: {
          name: "package2",
          namespace: "namespace2",
          generation: 2,
        },
        spec: {
          caBundle: {
            configMap: {
              name: "custom-ca-bundle-2",
              key: "trust-bundle.pem",
            },
          },
        },
      },
    ];

    beforeEach(() => {
      mockUDSPackageGet.mockResolvedValue({
        items: mockPackages,
      });
    });

    it("processes all UDS packages and calls caBundleConfigMap for each", async () => {
      UDSConfig.caBundle.certs = validCertBase64;
      UDSConfig.isIdentityDeployed = true;

      await updateAllCaBundleConfigMaps();

      expect(mockUDSPackageGet).toHaveBeenCalled();
      expect(mockK8sApply).toHaveBeenCalledTimes(4); // Namespace + 2 packages + Istio ConfigMap

      // Should process Namespace
      expect(mockK8sApply).toHaveBeenCalledWith({
        metadata: { name: "istio-system" },
      });

      // Should process package1
      expect(mockK8sApply).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            name: "custom-ca-bundle-1",
            namespace: "namespace1",
          }),
          data: {
            "ca-bundle.pem": validCert,
          },
        }),
        { force: true },
      );

      // Should process package2
      expect(mockK8sApply).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            name: "custom-ca-bundle-2",
            namespace: "namespace2",
          }),
          data: {
            "trust-bundle.pem": validCert,
          },
        }),
        { force: true },
      );
    });

    it("deletes ConfigMaps when no CA content is available", async () => {
      // No certs configured
      UDSConfig.caBundle.certs = "";
      UDSConfig.caBundle.includeDoDCerts = false;
      UDSConfig.caBundle.includePublicCerts = false;
      UDSConfig.isIdentityDeployed = true;

      await updateAllCaBundleConfigMaps();

      expect(mockUDSPackageGet).toHaveBeenCalled();
      // Should be called 2 times: 1 for Namespace, 1 for the Istio ConfigMap update (clearing it)
      expect(mockK8sApply).toHaveBeenCalledTimes(2);
      expect(mockK8sApply).toHaveBeenCalledWith({
        metadata: { name: "istio-system" },
      });
      expect(mockK8sApply).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            name: "uds-trust-bundle",
            namespace: "istio-system",
            labels: {
              "uds.dev/pod-reload": "true",
            },
          }),
          data: {
            "extra.pem": "",
          },
        }),
        { force: true },
      );
      expect(mockK8sDelete).toHaveBeenCalledTimes(2);
    });

    it("synchronizes Istio trust bundle even when no UDS packages exist", async () => {
      mockUDSPackageGet.mockResolvedValue({ items: [] });

      await updateAllCaBundleConfigMaps();

      expect(mockUDSPackageGet).toHaveBeenCalled();
      expect(mockK8sApply).toHaveBeenCalledWith({
        metadata: { name: "istio-system" },
      });
      expect(mockK8sApply).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: "ConfigMap",
          metadata: expect.objectContaining({
            name: "uds-trust-bundle",
            namespace: "istio-system",
            labels: {
              "uds.dev/pod-reload": "true",
            },
          }),
        }),
        { force: true },
      );
      expect(mockK8sDelete).not.toHaveBeenCalled();
    });

    it("synchronizes Istio trust bundle even when packages.items is undefined", async () => {
      mockUDSPackageGet.mockResolvedValue({});

      await updateAllCaBundleConfigMaps();

      expect(mockUDSPackageGet).toHaveBeenCalled();
      expect(mockK8sApply).toHaveBeenCalledWith({
        metadata: { name: "istio-system" },
      });
      expect(mockK8sApply).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: "ConfigMap",
          metadata: expect.objectContaining({
            name: "uds-trust-bundle",
            namespace: "istio-system",
            labels: {
              "uds.dev/pod-reload": "true",
            },
          }),
        }),
        { force: true },
      );
      expect(mockK8sDelete).not.toHaveBeenCalled();
    });

    it("skips Istio CA ConfigMap management when not in watcher or dev mode", async () => {
      process.env.PEPR_WATCH_MODE = "false";
      process.env.PEPR_MODE = "prod";
      mockUDSPackageGet.mockResolvedValue({ items: [] });

      await updateAllCaBundleConfigMaps();

      expect(mockUDSPackageGet).toHaveBeenCalled();
      // Should not call Apply for Namespace or ConfigMap in istio-system
      expect(mockK8sApply).not.toHaveBeenCalled();
    });

    it("manages Istio CA ConfigMap when in dev mode even if not in watcher mode", async () => {
      process.env.PEPR_WATCH_MODE = "false";
      process.env.PEPR_MODE = "dev";
      mockUDSPackageGet.mockResolvedValue({ items: [] });

      await updateAllCaBundleConfigMaps();

      expect(mockUDSPackageGet).toHaveBeenCalled();
      // Should call Apply for Namespace and ConfigMap
      expect(mockK8sApply).toHaveBeenCalledWith({
        metadata: { name: "istio-system" },
      });
    });

    it("throws error when package listing fails", async () => {
      mockUDSPackageGet.mockRejectedValue(new Error("K8s get packages failed"));

      await expect(updateAllCaBundleConfigMaps()).rejects.toThrow(
        /Failed to update CA bundle ConfigMaps for all packages/,
      );
    });

    it("continues processing other packages when one package fails", async () => {
      UDSConfig.caBundle.certs = validCertBase64;
      UDSConfig.isIdentityDeployed = true;

      // Mock specific Apply behavior based on the resource metadata to avoid race conditions in mock ordering
      mockK8sApply.mockReset();
      mockK8sApply.mockImplementation(manifest => {
        if (manifest.kind === "Namespace") {
          return Promise.resolve({});
        }
        if (manifest.metadata.name === "custom-ca-bundle-1") {
          return Promise.reject(new Error("Apply failed for package1"));
        }
        return Promise.resolve({});
      });

      await updateAllCaBundleConfigMaps();

      expect(mockUDSPackageGet).toHaveBeenCalled();
      expect(mockK8sApply).toHaveBeenCalledTimes(4); // Namespace + 2 packages + Istio CM

      // Should log error for first package but continue
      expect(mockLog.error).toHaveBeenCalledWith(
        "Failed to process CA bundle ConfigMap for package package1 in namespace namespace1",
        expect.any(Error),
      );

      // Should still process second package
      expect(mockK8sApply).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            name: "custom-ca-bundle-2",
            namespace: "namespace2",
          }),
        }),
        { force: true },
      );
    });

    it("processes packages with combined certificate content", async () => {
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
  });

  describe("buildCABundleContent", () => {
    it("merges all certificate sources correctly", () => {
      UDSConfig.caBundle.certs = validCertBase64;
      UDSConfig.caBundle.includeDoDCerts = true;
      UDSConfig.caBundle.includePublicCerts = true;
      UDSConfig.caBundle.dodCerts = btoa(dodCerts);
      UDSConfig.caBundle.publicCerts = btoa(publicCerts);

      const result = buildCABundleContent();
      const expected = [validCert, dodCerts, publicCerts].join("\n\n");
      expect(result).toBe(expected);
    });

    it("handles missing sources correctly", () => {
      UDSConfig.caBundle.certs = "";
      UDSConfig.caBundle.includeDoDCerts = true;
      UDSConfig.caBundle.includePublicCerts = false;
      UDSConfig.caBundle.dodCerts = btoa(dodCerts);
      UDSConfig.caBundle.publicCerts = btoa(publicCerts);

      const result = buildCABundleContent();
      expect(result).toBe(dodCerts);
    });

    it("returns empty string when no sources are configured", () => {
      UDSConfig.caBundle.certs = "";
      UDSConfig.caBundle.includeDoDCerts = false;
      UDSConfig.caBundle.includePublicCerts = false;
      UDSConfig.caBundle.dodCerts = btoa(dodCerts);
      UDSConfig.caBundle.publicCerts = btoa(publicCerts);

      const result = buildCABundleContent();
      expect(result).toBe("");
    });
  });
});
