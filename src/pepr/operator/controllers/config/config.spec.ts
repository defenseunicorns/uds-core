/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { kind } from "pepr";

import { beforeEach, describe, expect, it, vi } from "vitest";
import { ClusterConfig, ClusterConfigName, ConfigPhase as Phase } from "../../crd";
import { updateAllCaBundleConfigMaps } from "../ca-bundles/ca-bundle";
import { reconcileAuthservice } from "../keycloak/authservice/authservice";
import { Action } from "../keycloak/authservice/types";
import { initAPIServerCIDR } from "../network/generators/kubeAPI";
import { initAllNodesTarget } from "../network/generators/kubeNodes";
import {
  ConfigAction,
  ConfigStep,
  UDSConfig,
  configLog,
  decodeSecret,
  getConfigLogMessage,
  handleCfg,
  handleCfgSecret,
  handleUDSCACertsConfigMapUpdate,
  loadUDSConfig,
  shouldSkip,
  shouldUpdateClusterResources,
} from "./config";

// Mock dependencies
const mockClusterConfGet = vi.fn();
const mockSecretGet = vi.fn();
const mockConfigMapGet = vi.fn();
const mockPatchStatus = vi.fn();
const mockBuildCABundleContent = vi.fn();

vi.mock("../keycloak/authservice/authservice", () => ({
  reconcileAuthservice: vi.fn(),
}));

vi.mock("../network/generators/kubeAPI", () => ({
  initAPIServerCIDR: vi.fn(),
}));

vi.mock("../network/generators/kubeNodes", () => ({
  initAllNodesTarget: vi.fn(),
}));

vi.mock("../../crd/validators/clusterconfig-validator", () => ({
  validateCfg: vi.fn(),
}));

vi.mock("../ca-bundles/ca-bundle", () => ({
  updateAllCaBundleConfigMaps: vi.fn(),
  buildCABundleContent: vi.fn(),
}));

import * as caBundleModule from "../ca-bundles/ca-bundle";
vi.spyOn(caBundleModule, "buildCABundleContent").mockImplementation(mockBuildCABundleContent);

vi.mock("../../../logger", () => {
  const mockLogger = {
    warn: vi.fn(),
    level: vi.fn(),
    fatal: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
  };
  return {
    Component: {
      OPERATOR_CONFIG: "operator-config",
    },
    setupLogger: vi.fn(() => mockLogger),
  };
});

vi.mock("pepr", async importOriginal => {
  const actual: typeof import("pepr") = await importOriginal();
  return {
    ...actual,
    K8s: vi.fn().mockImplementation(resourceKind => {
      if (resourceKind === ClusterConfig) {
        return {
          Get: mockClusterConfGet,
          PatchStatus: mockPatchStatus,
        };
      }
      if (resourceKind === kind.Secret) {
        return { InNamespace: vi.fn().mockReturnValue({ Get: mockSecretGet }) };
      }
      if (resourceKind === kind.ConfigMap) {
        return { InNamespace: vi.fn().mockReturnValue({ Get: mockConfigMapGet }) };
      }
    }),
  };
});

const exampleCACert = `-----BEGIN CERTIFICATE-----
MIIDTDCCAjSgAwIBAgIId3cGJyapsXwwDQYJKoZIhvcNAQELBQAwRDELMAkGA1UEBhMCVVMxFDAS
BgNVBAoMC0FmZmlybVRydXN0MR8wHQYDVQQDDBZBZmZpcm1UcnVzdCBDb21tZXJjaWFsMB4XDTEw
MDEyOTE0MDYwNloXDTMwMTIzMTE0MDYwNlowRDELMAkGA1UEBhMCVVMxFDASBgNVBAoMC0FmZmly
bVRydXN0MR8wHQYDVQQDDBZBZmZpcm1UcnVzdCBDb21tZXJjaWFsMIIBIjANBgkqhkiG9w0BAQEF
AAOCAQ8AMIIBCgKCAQEA9htPZwcroRX1BiLLHwGy43NFBkRJLLtJJRTWzsO3qyxPxkEylFf6Eqdb
DuKPHx6GGaeqtS25Xw2Kwq+FNXkyLbscYjfysVtKPcrNcV/pQr6U6Mje+SJIZMblq8Yrba0F8PrV
C8+a5fBQpIs7R6UjW3p6+DM/uO+Zl+MgwdYoic+U+7lF7eNAFxHUdPALMeIrJmqbTFeurCA+ukV6
BfO9m2kVrn1OIGPENXY6BwLJN/3HR+7o8XYdcxXyl6S1yHp52UKqK39c/s4mT6NmgTWvRLpUHhww
MmWd5jyTXlBOeuM61G7MGvv50jeuJCqrVwMiKA1JdX+3KNp1v47j3A55MQIDAQABo0IwQDAdBgNV
HQ4EFgQUnZPGU4teyq8/nx4P5ZmVvCT2lI8wDwYDVR0TAQH/BAUwAwEB/zAOBgNVHQ8BAf8EBAMC
AQYwDQYJKoZIhvcNAQELBQADggEBAFis9AQOzcAN/wr91LoWXym9e2iZWEnStB03TX8nfUYGXUPG
hi4+c7ImfU+TqbbEKpqrIZcUsd6M06uJFdhrJNTxFq7YpFzUf1GO7RgBsZNjvbz4YYCanrHOQnDi
qX0GJX0nof5v7LMeJNrjS1UaADs1tDvZ110w/YETifLCBivtZ8SOyUOyXGsViQK8YvxO8rUzqrJv
0wqiUOP2O+guRMLbZjipM1ZI8W0bM40NjD9gN53Tym1+NH4Nn3J2ixufcv1SNUFFApYvHLKac0kh
sUlHRUe072o0EclNmsxZt9YCnlpOZbWUrhvfKbAW8b8Angc6F2S1BLUjIZkKlTuXfO8=
-----END CERTIFICATE-----
`;

const exampleCACertBase64 = btoa(exampleCACert);

let mockCfg: ClusterConfig;
const defaultConfig: ClusterConfig = {
  metadata: {
    name: ClusterConfigName.UdsClusterConfig,
    generation: 1,
  },
  status: {
    observedGeneration: 0, // Different from generation to ensure not skipped
  },
  spec: {
    caBundle: {
      certs: exampleCACertBase64,
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

let mockSecret: kind.Secret;
const defaultSecret: kind.Secret = {
  metadata: {
    name: "uds-operator-config",
    namespace: "pepr-system",
  },
  data: {
    AUTHSERVICE_REDIS_URI: btoa("mock-redis-uri"),
  },
};

describe("initial config load", () => {
  beforeEach(() => {
    process.env.PEPR_WATCH_MODE = "true";
    process.env.PEPR_MODE = "dev";
    vi.clearAllMocks();
    mockBuildCABundleContent.mockReturnValue("");
    mockCfg = defaultConfig;
    mockSecret = defaultSecret;
    mockClusterConfGet.mockResolvedValue(mockCfg);
    mockSecretGet.mockResolvedValue(mockSecret);
    mockConfigMapGet.mockResolvedValue({
      data: {
        dodCACerts: "",
        publicCACerts: "",
      },
    });
  });

  it("loads initial config", async () => {
    await loadUDSConfig();

    expect(UDSConfig.caBundle.certs).toBe(exampleCACertBase64);
    expect(UDSConfig.kubeApiCIDR).toBe("mock-cidr");
    expect(UDSConfig.kubeNodeCIDRs).toStrictEqual(["mock-node-cidrs"]);
    expect(UDSConfig.domain).toBe("mock-domain");
    expect(UDSConfig.adminDomain).toBe("mock-admin-domain");
    expect(UDSConfig.allowAllNSExemptions).toBe(true);
    expect(UDSConfig.authserviceRedisUri).toBe("mock-redis-uri");
  });

  it("throws error because no config", async () => {
    mockClusterConfGet.mockResolvedValue(undefined);

    const mockError = new Error("Error while fetching cluster config");

    await expect(loadUDSConfig()).rejects.toThrowError(mockError);
  });

  it("throws error because no config secret", async () => {
    mockSecretGet.mockResolvedValue(undefined);

    const mockError = new Error("Error while fetching operator config secret");

    await expect(loadUDSConfig()).rejects.toThrowError(mockError);
  });

  it("validates config and bubbles error", async () => {
    const invalidCfg = {
      ...mockCfg,
      spec: {
        ...mockCfg.spec,
        expose: {
          ...mockCfg.spec!.expose,
          caCert: "invalid-cert",
        },
      },
    };

    mockClusterConfGet.mockResolvedValue(invalidCfg);

    try {
      await loadUDSConfig();
    } catch (e) {
      expect(e.message).toBe("ClusterConfig: caCert must be base64 encoded; found invalid value");
    }
  });

  it("should not update cluster resources during initial load", async () => {
    await loadUDSConfig();

    expect(initAPIServerCIDR).not.toHaveBeenCalled();
    expect(initAllNodesTarget).not.toHaveBeenCalled();
    expect(reconcileAuthservice).not.toHaveBeenCalled();
  });
});

// Tests for helper functions
describe("Config Helper Functions", () => {
  describe("getConfigLogMessage", () => {
    it("should generate loading start message", () => {
      const message = getConfigLogMessage(ConfigAction.LOAD, ConfigStep.START, "test-resource");
      expect(message).toBe("Loading UDS Config from test-resource");
    });

    it("should generate loading finish message", () => {
      const message = getConfigLogMessage(ConfigAction.LOAD, ConfigStep.FINISH, "test-resource");
      expect(message).toBe("Loaded UDS Config from test-resource");
    });

    it("should generate updating start message with change", () => {
      const message = getConfigLogMessage(ConfigAction.UPDATE, ConfigStep.START, "test-resource");
      expect(message).toBe("Updating UDS Config from test-resource change");
    });

    it("should generate updating finish message with change", () => {
      const message = getConfigLogMessage(ConfigAction.UPDATE, ConfigStep.FINISH, "test-resource");
      expect(message).toBe("Updated UDS Config from test-resource change");
    });
  });

  describe("shouldUpdateClusterResources", () => {
    beforeEach(() => {
      // Reset environment variables before each test
      delete process.env.PEPR_WATCH_MODE;
      delete process.env.PEPR_MODE;
    });

    it("should return false for LOAD action regardless of env vars", () => {
      process.env.PEPR_WATCH_MODE = "true";
      process.env.PEPR_MODE = "dev";
      expect(shouldUpdateClusterResources(ConfigAction.LOAD)).toBe(false);
    });

    it("should return true for UPDATE action with PEPR_WATCH_MODE=true", () => {
      process.env.PEPR_WATCH_MODE = "true";
      expect(shouldUpdateClusterResources(ConfigAction.UPDATE)).toBe(true);
    });

    it("should return true for UPDATE action with PEPR_MODE=dev", () => {
      process.env.PEPR_MODE = "dev";
      expect(shouldUpdateClusterResources(ConfigAction.UPDATE)).toBe(true);
    });

    it("should return false for UPDATE action with no env vars set", () => {
      expect(shouldUpdateClusterResources(ConfigAction.UPDATE)).toBe(false);
    });
  });

  describe("shouldSkip", () => {
    it("should return true when status phase is Pending", () => {
      const cfg: ClusterConfig = {
        metadata: {
          name: ClusterConfigName.UdsClusterConfig,
          generation: 1,
        },
        status: {
          phase: Phase.Pending,
          observedGeneration: 0,
        },
      };

      expect(shouldSkip(cfg)).toBe(true);
    });

    it("should return true when current generation already processed", () => {
      const cfg: ClusterConfig = {
        metadata: {
          name: ClusterConfigName.UdsClusterConfig,
          generation: 1,
        },
        status: {
          phase: Phase.Ready,
          observedGeneration: 1,
        },
      };

      expect(shouldSkip(cfg)).toBe(true);
    });

    it("should return false when generation is different from observedGeneration", () => {
      const cfg: ClusterConfig = {
        metadata: {
          name: ClusterConfigName.UdsClusterConfig,
          generation: 2,
        },
        status: {
          phase: Phase.Ready,
          observedGeneration: 1,
        },
      };

      expect(shouldSkip(cfg)).toBe(false);
    });

    it("should return false when no status exists", () => {
      const cfg: ClusterConfig = {
        metadata: {
          name: ClusterConfigName.UdsClusterConfig,
          generation: 1,
        },
      };

      expect(shouldSkip(cfg)).toBe(false);
    });

    it("should return false when status phase is not Pending and generation differs", () => {
      const cfg: ClusterConfig = {
        metadata: {
          name: ClusterConfigName.UdsClusterConfig,
          generation: 3,
        },
        status: {
          phase: Phase.Failed,
          observedGeneration: 2,
        },
      };

      expect(shouldSkip(cfg)).toBe(false);
    });
  });
});

// Test for decodeSecret function error handling
describe("decodeSecret", () => {
  it("should handle invalid base64 data", () => {
    // Create a secret with invalid base64 data
    const invalidSecret: kind.Secret = {
      metadata: {
        name: "invalid-secret",
        namespace: "test",
      },
      data: {
        // This is not valid base64
        INVALID_KEY: "!@#$%^",
        // Valid base64 for comparison
        VALID_KEY: btoa("test-value"),
      },
    };

    // Spy on the configLog.error method
    const errorSpy = vi.spyOn(configLog, "error");

    // Call decodeSecret directly
    const result = decodeSecret(invalidSecret);

    // Verify the error was logged
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Failed to decode secret key: INVALID_KEY"),
    );

    // Verify the valid key was decoded correctly
    expect(result.VALID_KEY).toBe("test-value");

    // Verify the invalid key is not in the result
    expect(result.INVALID_KEY).toBe(undefined);

    // Clean up the spy
    errorSpy.mockRestore();
  });
});

describe("handleUDSConfig", () => {
  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();
    mockCfg = defaultConfig;
    mockSecret = defaultSecret;
    mockClusterConfGet.mockResolvedValue(mockCfg);
    mockSecretGet.mockResolvedValue(mockSecret);
    UDSConfig.caBundle.certs = "";
    UDSConfig.caBundle.includeDoDCerts = false;
    UDSConfig.caBundle.includePublicCerts = false;
    UDSConfig.authserviceRedisUri = "";
    UDSConfig.kubeApiCIDR = "";
    UDSConfig.kubeNodeCIDRs = [];
    UDSConfig.domain = "uds.dev";
    UDSConfig.adminDomain = "";
    UDSConfig.allowAllNSExemptions = false;
    process.env.PEPR_WATCH_MODE = "true";
    process.env.PEPR_MODE = "dev";
  });

  it("handles update to operator-config secret and updates UDSConfig secret values", async () => {
    await handleCfgSecret(mockSecret, ConfigAction.UPDATE);

    expect(UDSConfig.authserviceRedisUri).toBe("mock-redis-uri");
  });

  it("handles updates to ClusterConfig and updates UDSConfig", async () => {
    await handleCfg(mockCfg, ConfigAction.UPDATE);

    expect(UDSConfig.caBundle.certs).toBe(exampleCACertBase64);
    expect(UDSConfig.kubeApiCIDR).toBe("mock-cidr");
    expect(UDSConfig.kubeNodeCIDRs).toStrictEqual(["mock-node-cidrs"]);
    expect(UDSConfig.domain).toBe("mock-domain");
    expect(UDSConfig.adminDomain).toBe("mock-admin-domain");
    expect(UDSConfig.allowAllNSExemptions).toBe(true);
  });

  describe("reconcileAuthservice", () => {
    it("calls if CA Cert changes", async () => {
      UDSConfig.caBundle.certs = "old-ca-cert";
      mockBuildCABundleContent.mockReturnValue(exampleCACert);

      await handleCfg(mockCfg, ConfigAction.UPDATE);

      expect(reconcileAuthservice).toHaveBeenCalledWith({
        name: "global-config-update",
        action: Action.UpdateGlobalConfig,
        redisUri: "",
        trustedCA: exampleCACert,
      });
    });

    it("calls if CA Cert changes to empty string (dev mode)", async () => {
      UDSConfig.caBundle.certs = "old-ca-cert";
      mockBuildCABundleContent.mockReturnValue("");
      const cfg = {
        ...mockCfg,
        spec: {
          ...mockCfg.spec,
          caBundle: {
            ...mockCfg.spec!.caBundle,
            certs: "###ZARF_VAR_CA_BUNDLE_CERTS###",
          },
        },
      } as ClusterConfig;

      await handleCfg(cfg, ConfigAction.UPDATE);

      expect(reconcileAuthservice).toHaveBeenCalledWith({
        name: "global-config-update",
        action: Action.UpdateGlobalConfig,
        redisUri: "",
        trustedCA: "",
      });
    });

    it("does not call if CA Cert key is undefined", async () => {
      UDSConfig.caBundle.certs = "old-ca-cert";
      mockBuildCABundleContent.mockReturnValue("");
      const cfg = {
        ...mockCfg,
        spec: {
          ...mockCfg.spec,
          caBundle: {
            ...mockCfg.spec!.caBundle,
            certs: undefined,
          },
        },
      } as ClusterConfig;

      await handleCfg(cfg, ConfigAction.UPDATE);

      expect(reconcileAuthservice).toHaveBeenCalledWith({
        name: "global-config-update",
        action: Action.UpdateGlobalConfig,
        redisUri: "",
        trustedCA: "",
      });
    });

    it("always calls reconcileAuthservice even if CA Cert is still empty string (dev mode)", async () => {
      const cfg = {
        ...defaultConfig,
        spec: {
          ...defaultConfig.spec,
          caBundle: {
            certs: "###ZARF_VAR_CA_BUNDLE_CERTS###",
          },
        },
      } as ClusterConfig;
      await handleCfg(cfg, ConfigAction.UPDATE);

      expect(reconcileAuthservice).toHaveBeenCalled();
    });

    it("calls if Redis URI changes", async () => {
      UDSConfig.caBundle.certs = btoa("old-ca-cert");
      UDSConfig.authserviceRedisUri = "old-redis-uri";
      mockBuildCABundleContent.mockReturnValue("old-ca-cert");

      await handleCfgSecret(mockSecret, ConfigAction.UPDATE);

      expect(reconcileAuthservice).toHaveBeenCalledWith({
        name: "global-config-update",
        action: Action.UpdateGlobalConfig,
        redisUri: "mock-redis-uri",
        trustedCA: "old-ca-cert",
      });
    });

    it("calls if setting Redis URI to empty string", async () => {
      UDSConfig.authserviceRedisUri = "old-redis-uri";
      const emptyRedisURI = { ...mockSecret, data: { AUTHSERVICE_REDIS_URI: btoa("") } };
      mockBuildCABundleContent.mockReturnValue("");

      await handleCfgSecret(emptyRedisURI, ConfigAction.UPDATE);

      expect(reconcileAuthservice).toHaveBeenCalledWith({
        name: "global-config-update",
        action: Action.UpdateGlobalConfig,
        redisUri: "",
        trustedCA: "",
      });
    });

    it("calls if setting Redis URI to empty string (dev mode)", async () => {
      UDSConfig.authserviceRedisUri = "old-redis-uri";
      const emptyRedisURI = {
        ...mockSecret,
        data: { AUTHSERVICE_REDIS_URI: btoa("###ZARF_VAR_AUTHSERVICE_REDIS_URI###") },
      };
      mockBuildCABundleContent.mockReturnValue("");

      await handleCfgSecret(emptyRedisURI, ConfigAction.UPDATE);

      expect(reconcileAuthservice).toHaveBeenCalledWith({
        name: "global-config-update",
        action: Action.UpdateGlobalConfig,
        redisUri: "",
        trustedCA: "",
      });
    });

    it("calls if AUTHSERVICE_REDIS_URI key is missing and sets to empty string", async () => {
      UDSConfig.authserviceRedisUri = "original";
      const emptyRedisURI = { ...mockSecret, data: {} };
      mockBuildCABundleContent.mockReturnValue("");

      await handleCfgSecret(emptyRedisURI, ConfigAction.UPDATE);

      expect(reconcileAuthservice).toHaveBeenCalledWith({
        name: "global-config-update",
        action: "UpdateGlobalConfig",
        redisUri: "",
        trustedCA: "",
      });
    });

    it("does not call if Redis URI is still empty string (dev mode)", async () => {
      UDSConfig.authserviceRedisUri = "";
      const emptyRedisURI = {
        ...mockSecret,
        data: { AUTHSERVICE_REDIS_URI: btoa("###ZARF_VAR_AUTHSERVICE_REDIS_URI###") },
      };

      await handleCfgSecret(emptyRedisURI, ConfigAction.UPDATE);

      expect(reconcileAuthservice).not.toHaveBeenCalled();
    });
  });

  it("should call initAPIServerCIDR if KUBEAPI_CIDR changes", async () => {
    UDSConfig.kubeApiCIDR = "old-cidr";

    await handleCfg(mockCfg, ConfigAction.UPDATE);

    expect(initAPIServerCIDR).toHaveBeenCalled();
  });

  it("should call initAllNodesTarget if KUBENODE_CIDRS changes", async () => {
    UDSConfig.kubeNodeCIDRs = ["old-node-cidrs"];

    await handleCfg(mockCfg, ConfigAction.UPDATE);

    expect(initAllNodesTarget).toHaveBeenCalled();
  });

  it("updates domain and adminDomain with fallback values if unset", async () => {
    mockCfg.spec!.expose.domain = "###ZARF_VAR_DOMAIN###";
    mockCfg.spec!.expose.adminDomain = "###ZARF_VAR_ADMIN_DOMAIN###";

    await handleCfg(mockCfg, ConfigAction.LOAD);

    expect(UDSConfig.domain).toBe("uds.dev");
    expect(UDSConfig.adminDomain).toBe("admin.uds.dev");
  });

  it("does not call unnecessary updates if no values change", async () => {
    // Set UDSConfig to match mockCfg
    UDSConfig.caBundle.certs = exampleCACertBase64;
    UDSConfig.caBundle.includeDoDCerts = false;
    UDSConfig.caBundle.includePublicCerts = false;
    UDSConfig.caBundle.dodCerts = "";
    UDSConfig.caBundle.publicCerts = "";

    UDSConfig.kubeApiCIDR = "mock-cidr";
    UDSConfig.kubeNodeCIDRs = ["mock-node-cidrs"];
    UDSConfig.domain = "mock-domain";
    UDSConfig.adminDomain = "mock-admin-domain";
    UDSConfig.allowAllNSExemptions = true;

    // Mock buildCABundleContent to return exactly what UDSConfig.caBundle.certs decodes to
    mockBuildCABundleContent.mockReturnValue(exampleCACert);

    // Reset the mock to ensure it wasn't called by handleCABundleUpdate setup
    vi.mocked(reconcileAuthservice).mockClear();

    await handleCfg(mockCfg, ConfigAction.UPDATE);

    expect(reconcileAuthservice).toHaveBeenCalled();
    expect(initAPIServerCIDR).not.toHaveBeenCalled();
    expect(initAllNodesTarget).not.toHaveBeenCalled();
  });

  it("does not call netpol updates if no values change", async () => {
    // Set mockSecret to match UDSConfig data
    mockCfg.spec!.networking!.kubeApiCIDR = "";
    mockCfg.spec!.networking!.kubeNodeCIDRs = [];

    await handleCfg(mockCfg, ConfigAction.UPDATE);

    expect(initAPIServerCIDR).not.toHaveBeenCalled();
    expect(initAllNodesTarget).not.toHaveBeenCalled();
  });

  it("should not update cluster resources during initial load", async () => {
    mockCfg.spec!.networking!.kubeApiCIDR = "diff-cidr";
    mockCfg.spec!.networking!.kubeNodeCIDRs = ["diff-cidr"];
    await handleCfg(mockCfg, ConfigAction.LOAD);
    await handleCfgSecret(mockSecret, ConfigAction.LOAD);

    expect(initAPIServerCIDR).not.toHaveBeenCalled();
    expect(initAllNodesTarget).not.toHaveBeenCalled();
    expect(reconcileAuthservice).not.toHaveBeenCalled();
  });

  describe("CA Bundle ConfigMaps update logic", () => {
    beforeEach(() => {
      vi.clearAllMocks();
      mockCfg = {
        ...defaultConfig,
        metadata: { ...defaultConfig.metadata, generation: 2 },
        status: { observedGeneration: 1 },
      };
      mockClusterConfGet.mockResolvedValue(mockCfg);
      mockSecretGet.mockResolvedValue(mockSecret);
      mockConfigMapGet.mockResolvedValue({
        data: { dodCACerts: "", publicCACerts: "" },
      });
      UDSConfig.caBundle.certs = "";
      UDSConfig.caBundle.includeDoDCerts = false;
      UDSConfig.caBundle.includePublicCerts = false;
      UDSConfig.caBundle.dodCerts = "";
      UDSConfig.caBundle.publicCerts = "";
      process.env.PEPR_WATCH_MODE = "true";
    });

    it("calls updateAllCaBundleConfigMaps when certs change", async () => {
      UDSConfig.caBundle.certs = "old-cert";

      await handleCfg(mockCfg, ConfigAction.UPDATE);

      expect(updateAllCaBundleConfigMaps).toHaveBeenCalled();
    });

    it("calls updateAllCaBundleConfigMaps when includeDoDCerts changes", async () => {
      UDSConfig.caBundle.includeDoDCerts = false;
      mockCfg.spec!.caBundle!.includeDoDCerts = true;

      await handleCfg(mockCfg, ConfigAction.UPDATE);

      expect(updateAllCaBundleConfigMaps).toHaveBeenCalled();
    });

    it("calls updateAllCaBundleConfigMaps when DoD cert content changes", async () => {
      UDSConfig.caBundle.includeDoDCerts = true;
      UDSConfig.caBundle.dodCerts = "old-dod-certs";
      mockCfg.spec!.caBundle!.includeDoDCerts = true;
      mockConfigMapGet.mockResolvedValue({
        data: { dodCACerts: "new-dod-certs", publicCACerts: "" },
      });

      await handleCfg(mockCfg, ConfigAction.UPDATE);

      expect(updateAllCaBundleConfigMaps).toHaveBeenCalled();
    });

    it("always calls updateAllCaBundleConfigMaps for idempotent sync even when nothing changes", async () => {
      // Set UDSConfig to exactly match the mockCfg state
      UDSConfig.caBundle.certs = exampleCACertBase64;
      UDSConfig.caBundle.includeDoDCerts = false;
      UDSConfig.caBundle.includePublicCerts = false;
      UDSConfig.caBundle.dodCerts = "";
      UDSConfig.caBundle.publicCerts = "";

      // Make sure the mockCfg matches UDSConfig state
      mockCfg.spec!.caBundle!.certs = exampleCACertBase64;
      mockCfg.spec!.caBundle!.includeDoDCerts = false;
      mockCfg.spec!.caBundle!.includePublicCerts = false;

      await handleCfg(mockCfg, ConfigAction.UPDATE);

      // It should still be called with skipReload=true (first arg true)
      expect(updateAllCaBundleConfigMaps).toHaveBeenCalledWith(true);
    });
  });

  describe("DoD/Public cert loading logic", () => {
    beforeEach(() => {
      vi.clearAllMocks();
      mockCfg = {
        ...defaultConfig,
        metadata: { ...defaultConfig.metadata, generation: 2 },
        status: { observedGeneration: 1 },
      };
      mockClusterConfGet.mockResolvedValue(mockCfg);
      mockSecretGet.mockResolvedValue(mockSecret);
      UDSConfig.caBundle.certs = "";
      UDSConfig.caBundle.includeDoDCerts = false;
      UDSConfig.caBundle.includePublicCerts = false;
      UDSConfig.caBundle.dodCerts = "";
      UDSConfig.caBundle.publicCerts = "";
      process.env.PEPR_WATCH_MODE = "true";
    });

    it("loads DoD certs when includeDoDCerts is true and ConfigMap has data", async () => {
      mockCfg.spec!.caBundle!.includeDoDCerts = true;
      mockConfigMapGet.mockResolvedValue({
        data: {
          dodCACerts: "dod-cert-data",
          publicCACerts: "public-cert-data",
        },
      });

      await handleCfg(mockCfg, ConfigAction.UPDATE);

      expect(UDSConfig.caBundle.includeDoDCerts).toBe(true);
      expect(UDSConfig.caBundle.dodCerts).toBe("dod-cert-data");
    });

    it("loads Public certs when includePublicCerts is true and ConfigMap has data", async () => {
      mockCfg.spec!.caBundle!.includePublicCerts = true;
      mockConfigMapGet.mockResolvedValue({
        data: {
          dodCACerts: "dod-cert-data",
          publicCACerts: "public-cert-data",
        },
      });

      await handleCfg(mockCfg, ConfigAction.UPDATE);

      expect(UDSConfig.caBundle.includePublicCerts).toBe(true);
      expect(UDSConfig.caBundle.publicCerts).toBe("public-cert-data");
    });

    it("saves DoD certs in config even when includeDoDCerts is false", async () => {
      mockCfg.spec!.caBundle!.includeDoDCerts = false;
      mockConfigMapGet.mockResolvedValue({
        data: {
          dodCACerts: "dod-cert-data",
          publicCACerts: "public-cert-data",
        },
      });

      await handleCfg(mockCfg, ConfigAction.UPDATE);

      expect(UDSConfig.caBundle.includeDoDCerts).toBe(false);
      expect(UDSConfig.caBundle.dodCerts).toBe("dod-cert-data");
    });

    it("does not load DoD certs when ConfigMap has no dodCACerts data", async () => {
      mockCfg.spec!.caBundle!.includeDoDCerts = true;
      mockConfigMapGet.mockResolvedValue({
        data: {
          publicCACerts: "public-cert-data",
        },
      });

      await handleCfg(mockCfg, ConfigAction.UPDATE);

      expect(UDSConfig.caBundle.includeDoDCerts).toBe(true);
      expect(UDSConfig.caBundle.dodCerts).toBe("");
    });

    it("handles ConfigMap not found gracefully with default empty values", async () => {
      const warnSpy = vi.spyOn(configLog, "warn");
      mockCfg.spec!.caBundle!.includeDoDCerts = true;
      const notFoundError = Object.assign(new Error("ConfigMap not found"), { status: 404 });
      mockConfigMapGet.mockRejectedValue(notFoundError);

      await handleCfg(mockCfg, ConfigAction.UPDATE);

      // Should log a warning about the missing ConfigMap
      expect(warnSpy).toHaveBeenCalledWith(
        "CA certs ConfigMap not found, using empty values for DoD and public certs",
      );

      // Should use default empty values and continue processing
      expect(UDSConfig.caBundle.includeDoDCerts).toBe(true);
      expect(UDSConfig.caBundle.dodCerts).toBe("");
      expect(UDSConfig.caBundle.publicCerts).toBe("");

      // Should patch status to Ready (successful processing)
      expect(mockPatchStatus).toHaveBeenLastCalledWith({
        metadata: { name: ClusterConfigName.UdsClusterConfig },
        status: {
          phase: "Ready",
          observedGeneration: 2,
        },
      });

      warnSpy.mockRestore();
    });

    it("handles ConfigMap with no data field", async () => {
      mockCfg.spec!.caBundle!.includeDoDCerts = true;
      mockCfg.spec!.caBundle!.includePublicCerts = true;
      mockConfigMapGet.mockResolvedValue({});

      await handleCfg(mockCfg, ConfigAction.UPDATE);

      expect(UDSConfig.caBundle.includeDoDCerts).toBe(true);
      expect(UDSConfig.caBundle.includePublicCerts).toBe(true);
      expect(UDSConfig.caBundle.dodCerts).toBe("");
      expect(UDSConfig.caBundle.publicCerts).toBe("");
    });

    it("throws error for K8s API failures when fetching ConfigMap", async () => {
      mockCfg.spec!.caBundle!.includeDoDCerts = true;
      mockConfigMapGet.mockRejectedValue(new Error("K8s API timeout"));

      await expect(handleCfg(mockCfg, ConfigAction.UPDATE)).rejects.toThrow("K8s API timeout");

      // Should patch status to Failed
      expect(mockPatchStatus).toHaveBeenLastCalledWith({
        metadata: { name: ClusterConfigName.UdsClusterConfig },
        status: {
          phase: "Failed",
          observedGeneration: 2,
        },
      });
    });
  });

  describe("Error handling & Status updates", () => {
    beforeEach(() => {
      vi.clearAllMocks();
      mockPatchStatus.mockResolvedValue({});

      mockCfg = {
        ...defaultConfig,
        metadata: { ...defaultConfig.metadata, generation: 2 },
        status: { observedGeneration: 1 },
      };
      mockClusterConfGet.mockResolvedValue(mockCfg);
      mockSecretGet.mockResolvedValue(mockSecret);
      mockConfigMapGet.mockResolvedValue({
        data: { dodCACerts: "", publicCACerts: "" },
      });
    });

    it("patches status to Failed when error occurs and re-throws error", async () => {
      // Force an error by making updateAllCaBundleConfigMaps throw
      vi.mocked(updateAllCaBundleConfigMaps).mockRejectedValue(
        new Error("ConfigMap update failed"),
      );

      UDSConfig.caBundle.certs = "different-cert";
      process.env.PEPR_WATCH_MODE = "true";

      await expect(handleCfg(mockCfg, ConfigAction.UPDATE)).rejects.toThrow(
        "ConfigMap update failed",
      );

      // Should patch status to Failed
      expect(mockPatchStatus).toHaveBeenCalledWith({
        metadata: { name: ClusterConfigName.UdsClusterConfig },
        status: {
          phase: "Failed",
          observedGeneration: 2,
        },
      });
    });

    it("sets status to Pending at start and Ready on success", async () => {
      // Reset the mock to not throw an error
      vi.mocked(updateAllCaBundleConfigMaps).mockResolvedValue();

      await handleCfg(mockCfg, ConfigAction.UPDATE);

      // Should patch to Pending first, then Ready
      expect(mockPatchStatus).toHaveBeenNthCalledWith(1, {
        metadata: { name: ClusterConfigName.UdsClusterConfig },
        status: {
          phase: "Pending",
        },
      });

      expect(mockPatchStatus).toHaveBeenNthCalledWith(2, {
        metadata: { name: ClusterConfigName.UdsClusterConfig },
        status: {
          phase: "Ready",
          observedGeneration: 2,
        },
      });
    });
  });

  describe("Legacy CA cert placeholder handling", () => {
    beforeEach(() => {
      vi.clearAllMocks();
      mockCfg = {
        ...defaultConfig,
        metadata: { ...defaultConfig.metadata, generation: 2 },
        status: { observedGeneration: 1 },
      };
      mockClusterConfGet.mockResolvedValue(mockCfg);
      mockSecretGet.mockResolvedValue(mockSecret);
      mockConfigMapGet.mockResolvedValue({
        data: { dodCACerts: "", publicCACerts: "" },
      });
      mockPatchStatus.mockResolvedValue({});
    });

    it("handles legacy ###ZARF_VAR_CA_CERT### placeholder", async () => {
      mockCfg.spec!.caBundle!.certs = "###ZARF_VAR_CA_CERT###";
      UDSConfig.caBundle.certs = "old-cert";

      await handleCfg(mockCfg, ConfigAction.UPDATE);

      expect(UDSConfig.caBundle.certs).toBe("");
    });
  });

  describe("shouldSkip early return", () => {
    beforeEach(() => {
      vi.clearAllMocks();
      mockPatchStatus.mockResolvedValue({});
    });

    it("returns early when shouldSkip is true for UPDATE action without processing", async () => {
      const skippableCfg: ClusterConfig = {
        metadata: { name: ClusterConfigName.UdsClusterConfig, generation: 1 },
        status: { phase: Phase.Pending, observedGeneration: 1 },
      };

      await handleCfg(skippableCfg, ConfigAction.UPDATE);

      // Should not patch status or call any update functions
      expect(mockPatchStatus).not.toHaveBeenCalled();
      expect(updateAllCaBundleConfigMaps).not.toHaveBeenCalled();
    });

    it("processes config during LOAD action even when shouldSkip would return true", async () => {
      const skippableCfg: ClusterConfig = {
        metadata: { name: ClusterConfigName.UdsClusterConfig, generation: 1 },
        status: { phase: Phase.Pending, observedGeneration: 1 },
        spec: {
          caBundle: {
            certs: "",
            includeDoDCerts: false,
            includePublicCerts: false,
          },
          expose: {
            domain: "test-domain",
            adminDomain: "admin.test-domain",
          },
          networking: {},
          policy: {
            allowAllNsExemptions: false,
          },
        },
      };

      mockConfigMapGet.mockResolvedValue({
        data: { dodCACerts: "", publicCACerts: "" },
      });

      await handleCfg(skippableCfg, ConfigAction.LOAD);

      // Should process config despite pending status during LOAD
      expect(mockPatchStatus).toHaveBeenCalledWith({
        metadata: { name: ClusterConfigName.UdsClusterConfig },
        status: {
          phase: "Pending",
        },
      });

      expect(mockPatchStatus).toHaveBeenCalledWith({
        metadata: { name: ClusterConfigName.UdsClusterConfig },
        status: {
          phase: "Ready",
          observedGeneration: 1,
        },
      });

      expect(UDSConfig.domain).toBe("test-domain");
      expect(UDSConfig.adminDomain).toBe("admin.test-domain");
    });
  });

  describe("handleUDSCACertsConfigMapUpdate", () => {
    beforeEach(() => {
      vi.clearAllMocks();
      // Reset the mock to resolve successfully by default
      vi.mocked(updateAllCaBundleConfigMaps).mockResolvedValue();
      // Reset UDSConfig state
      UDSConfig.caBundle.certs = "";
      UDSConfig.caBundle.includeDoDCerts = false;
      UDSConfig.caBundle.includePublicCerts = false;
      UDSConfig.caBundle.dodCerts = "";
      UDSConfig.caBundle.publicCerts = "";
    });

    it("should update UDSConfig and call updateAllCaBundleConfigMaps when DoD certs change", async () => {
      // Set initial state - DoD certs enabled but different content
      UDSConfig.caBundle.includeDoDCerts = true;
      UDSConfig.caBundle.dodCerts = "old-dod-certs";

      const configMap: kind.ConfigMap = {
        metadata: { name: "uds-ca-certs", namespace: "pepr-system" },
        data: {
          dodCACerts: "new-dod-certs",
        },
      };

      await handleUDSCACertsConfigMapUpdate(configMap);

      expect(UDSConfig.caBundle.dodCerts).toBe("new-dod-certs");
      expect(updateAllCaBundleConfigMaps).toHaveBeenCalled();
    });

    it("should update UDSConfig and call updateAllCaBundleConfigMaps when public certs change", async () => {
      // Set initial state - public certs enabled but different content
      UDSConfig.caBundle.includePublicCerts = true;
      UDSConfig.caBundle.publicCerts = "old-public-certs";

      const configMap: kind.ConfigMap = {
        metadata: { name: "uds-ca-certs", namespace: "pepr-system" },
        data: {
          publicCACerts: "new-public-certs",
        },
      };

      await handleUDSCACertsConfigMapUpdate(configMap);

      expect(UDSConfig.caBundle.publicCerts).toBe("new-public-certs");
      expect(updateAllCaBundleConfigMaps).toHaveBeenCalled();
    });

    it("should update both DoD and public certs when both change", async () => {
      // Set initial state - both enabled but different content
      UDSConfig.caBundle.includeDoDCerts = true;
      UDSConfig.caBundle.includePublicCerts = true;
      UDSConfig.caBundle.dodCerts = "old-dod-certs";
      UDSConfig.caBundle.publicCerts = "old-public-certs";

      const configMap: kind.ConfigMap = {
        metadata: { name: "uds-ca-certs", namespace: "pepr-system" },
        data: {
          dodCACerts: "new-dod-certs",
          publicCACerts: "new-public-certs",
        },
      };

      await handleUDSCACertsConfigMapUpdate(configMap);

      expect(UDSConfig.caBundle.dodCerts).toBe("new-dod-certs");
      expect(UDSConfig.caBundle.publicCerts).toBe("new-public-certs");
      expect(updateAllCaBundleConfigMaps).toHaveBeenCalled();
    });

    it("should skip update when no changes are detected", async () => {
      // Set initial state - DoD certs enabled with same content
      UDSConfig.caBundle.includeDoDCerts = true;
      UDSConfig.caBundle.dodCerts = "same-dod-certs";

      const configMap: kind.ConfigMap = {
        metadata: { name: "uds-ca-certs", namespace: "pepr-system" },
        data: {
          dodCACerts: "same-dod-certs", // Same as current
        },
      };

      await handleUDSCACertsConfigMapUpdate(configMap);

      expect(UDSConfig.caBundle.dodCerts).toBe("same-dod-certs");
      expect(updateAllCaBundleConfigMaps).not.toHaveBeenCalled();
    });

    it("should skip update when ConfigMap has no data field", async () => {
      const configMap: kind.ConfigMap = {
        metadata: { name: "uds-ca-certs", namespace: "pepr-system" },
      };

      await handleUDSCACertsConfigMapUpdate(configMap);

      expect(UDSConfig.caBundle.dodCerts).toBe("");
      expect(UDSConfig.caBundle.publicCerts).toBe("");
      expect(updateAllCaBundleConfigMaps).not.toHaveBeenCalled();
    });

    it("should skip update when ConfigMap has empty data", async () => {
      const configMap: kind.ConfigMap = {
        metadata: { name: "uds-ca-certs", namespace: "pepr-system" },
        data: {},
      };

      await handleUDSCACertsConfigMapUpdate(configMap);

      expect(UDSConfig.caBundle.dodCerts).toBe("");
      expect(UDSConfig.caBundle.publicCerts).toBe("");
      expect(updateAllCaBundleConfigMaps).not.toHaveBeenCalled();
    });

    it("should throw error when updateAllCaBundleConfigMaps fails", async () => {
      vi.mocked(updateAllCaBundleConfigMaps).mockRejectedValue(new Error("Update failed"));

      // Set state that will trigger an update
      UDSConfig.caBundle.includeDoDCerts = true;
      UDSConfig.caBundle.dodCerts = "old-certs";

      const configMap: kind.ConfigMap = {
        metadata: { name: "uds-ca-certs", namespace: "pepr-system" },
        data: {
          dodCACerts: "new-certs",
        },
      };

      await expect(handleUDSCACertsConfigMapUpdate(configMap)).rejects.toThrow("Update failed");
      expect(UDSConfig.caBundle.dodCerts).toBe("new-certs"); // Still updates UDSConfig
    });

    it("should log appropriate debug messages", async () => {
      const debugSpy = vi.spyOn(configLog, "debug");

      // Set state that will trigger an update
      UDSConfig.caBundle.includeDoDCerts = true;
      UDSConfig.caBundle.dodCerts = "old-certs";

      const configMap: kind.ConfigMap = {
        metadata: { name: "uds-ca-certs", namespace: "pepr-system" },
        data: {
          dodCACerts: "new-certs",
        },
      };

      await handleUDSCACertsConfigMapUpdate(configMap);

      expect(debugSpy).toHaveBeenCalledWith("Processing uds-ca-certs ConfigMap update");
      expect(debugSpy).toHaveBeenCalledWith("Updated UDSConfig with new DoD and public CA certs");
      expect(debugSpy).toHaveBeenCalledWith("Successfully updated all CA bundle ConfigMaps");
    });

    it("should log skip message when no updates needed", async () => {
      const debugSpy = vi.spyOn(configLog, "debug");

      const configMap: kind.ConfigMap = {
        metadata: { name: "uds-ca-certs", namespace: "pepr-system" },
        data: {},
      };

      await handleUDSCACertsConfigMapUpdate(configMap);

      expect(debugSpy).toHaveBeenCalledWith("Processing uds-ca-certs ConfigMap update");
      expect(debugSpy).toHaveBeenCalledWith("No CA bundle updates needed, skipping");
    });
  });
});
