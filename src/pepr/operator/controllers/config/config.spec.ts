/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { kind } from "pepr";

import { beforeEach, describe, expect, it, vi } from "vitest";
import { ClusterConfig, Name } from "../../crd";
import { reconcileAuthservice } from "../keycloak/authservice/authservice";
import { initAPIServerCIDR } from "../network/generators/kubeAPI";
import { initAllNodesTarget } from "../network/generators/kubeNodes";
import {
  ConfigAction,
  configLog,
  decodeSecret,
  loadUDSConfig,
  UDSConfig,
  updateCfg,
  updateCfgSecrets,
} from "./config";

// Mock dependencies
const mockClusterConfGet = vi.fn();
const mockSecretGet = vi.fn();

vi.mock("../keycloak/authservice/authservice", () => ({
  reconcileAuthservice: vi.fn(),
}));

vi.mock("../network/generators/kubeAPI", () => ({
  initAPIServerCIDR: vi.fn(),
}));

vi.mock("../network/generators/kubeNodes", () => ({
  initAllNodesTarget: vi.fn(),
}));

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
        return { Get: mockClusterConfGet };
      }
      if (resourceKind === kind.Secret) {
        return { InNamespace: vi.fn().mockReturnValue({ Get: mockSecretGet }) };
      }
    }),
  };
});

let mockCfg: ClusterConfig;
const defaultConfig: ClusterConfig = {
  metadata: {
    name: Name.UdsClusterConfig,
  },
  spec: {
    expose: {
      domain: "mock-domain",
      adminDomain: "mock-admin-domain",
      caCert: btoa("mock-ca-cert"),
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
    mockCfg = defaultConfig;
    mockSecret = defaultSecret;
    mockClusterConfGet.mockResolvedValue(mockCfg);
    mockSecretGet.mockResolvedValue(mockSecret);
  });

  it("loads initial config", async () => {
    await loadUDSConfig();

    expect(UDSConfig.caCert).toBe(btoa("mock-ca-cert"));
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

describe("updateUDSConfig", () => {
  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();
    mockCfg = defaultConfig;
    mockSecret = defaultSecret;
    mockClusterConfGet.mockResolvedValue(mockCfg);
    mockSecretGet.mockResolvedValue(mockSecret);
    UDSConfig.caCert = "";
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
    await updateCfgSecrets(mockSecret, ConfigAction.UPDATE);

    expect(UDSConfig.authserviceRedisUri).toBe("mock-redis-uri");
  });

  it("handles updates to ClusterConfig and updates UDSConfig", async () => {
    await updateCfg(mockCfg, ConfigAction.UPDATE);

    expect(UDSConfig.caCert).toBe(btoa("mock-ca-cert"));
    expect(UDSConfig.kubeApiCIDR).toBe("mock-cidr");
    expect(UDSConfig.kubeNodeCIDRs).toStrictEqual(["mock-node-cidrs"]);
    expect(UDSConfig.domain).toBe("mock-domain");
    expect(UDSConfig.adminDomain).toBe("mock-admin-domain");
    expect(UDSConfig.allowAllNSExemptions).toBe(true);
  });

  describe("reconcileAuthservice", () => {
    it("calls if CA Cert changes", async () => {
      UDSConfig.caCert = "old-ca-cert";

      await updateCfg(mockCfg, ConfigAction.UPDATE);

      expect(reconcileAuthservice).toHaveBeenCalledWith({
        name: "global-config-update",
        action: "UpdateGlobalConfig",
        redisUri: "",
        trustedCA: "mock-ca-cert",
      });
    });

    it("calls if CA Cert changes to empty string (dev mode)", async () => {
      UDSConfig.caCert = "old-ca-cert";
      const cfg = {
        ...mockCfg,
        spec: { ...mockCfg.spec, expose: { caCert: "###ZARF_VAR_CA_CERT###" } },
      } as ClusterConfig;

      await updateCfg(cfg, ConfigAction.UPDATE);

      expect(reconcileAuthservice).toHaveBeenCalledWith({
        name: "global-config-update",
        action: "UpdateGlobalConfig",
        redisUri: "",
        trustedCA: "",
      });
    });

    it("does not call if CA Cert key is undefined", async () => {
      UDSConfig.caCert = "old-ca-cert";
      const cfg = { ...mockCfg, spec: { ...mockCfg.spec, expose: {} } } as ClusterConfig;

      await updateCfg(cfg, ConfigAction.UPDATE);

      expect(reconcileAuthservice).toHaveBeenCalledWith({
        name: "global-config-update",
        action: "UpdateGlobalConfig",
        redisUri: "",
        trustedCA: "",
      });
    });

    it("does not call if CA Cert is still empty string (dev mode)", async () => {
      UDSConfig.caCert = "";
      const cfg = {
        ...mockCfg,
        spec: { ...mockCfg.spec, expose: { caCert: "###ZARF_VAR_CA_CERT###" } },
      } as ClusterConfig;

      await updateCfg(cfg, ConfigAction.UPDATE);

      expect(reconcileAuthservice).not.toHaveBeenCalled();
    });

    it("calls if Redis URI changes", async () => {
      UDSConfig.caCert = btoa("old-ca-cert");
      UDSConfig.authserviceRedisUri = "old-redis-uri";

      await updateCfgSecrets(mockSecret, ConfigAction.UPDATE);

      expect(reconcileAuthservice).toHaveBeenCalledWith({
        name: "global-config-update",
        action: "UpdateGlobalConfig",
        redisUri: "mock-redis-uri",
        trustedCA: "old-ca-cert",
      });
    });

    it("calls if setting Redis URI to empty string", async () => {
      UDSConfig.authserviceRedisUri = "old-redis-uri";
      const emptyRedisURI = { ...mockSecret, data: { AUTHSERVICE_REDIS_URI: btoa("") } };

      await updateCfgSecrets(emptyRedisURI, ConfigAction.UPDATE);

      expect(reconcileAuthservice).toHaveBeenCalledWith({
        name: "global-config-update",
        action: "UpdateGlobalConfig",
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

      await updateCfgSecrets(emptyRedisURI, ConfigAction.UPDATE);

      expect(reconcileAuthservice).toHaveBeenCalledWith({
        name: "global-config-update",
        action: "UpdateGlobalConfig",
        redisUri: "",
        trustedCA: "",
      });
    });

    it("calls if AUTHSERVICE_REDIS_URI key is missing and sets to empty string", async () => {
      UDSConfig.authserviceRedisUri = "original";
      const emptyRedisURI = { ...mockSecret, data: {} };

      await updateCfgSecrets(emptyRedisURI, ConfigAction.UPDATE);

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

      await updateCfgSecrets(emptyRedisURI, ConfigAction.UPDATE);

      expect(reconcileAuthservice).not.toHaveBeenCalled();
    });
  });

  it("should call initAPIServerCIDR if KUBEAPI_CIDR changes", async () => {
    UDSConfig.kubeApiCIDR = "old-cidr";

    await updateCfg(mockCfg, ConfigAction.UPDATE);

    expect(initAPIServerCIDR).toHaveBeenCalled();
  });

  it("should call initAllNodesTarget if KUBENODE_CIDRS changes", async () => {
    UDSConfig.kubeNodeCIDRs = ["old-node-cidrs"];

    await updateCfg(mockCfg, ConfigAction.UPDATE);

    expect(initAllNodesTarget).toHaveBeenCalled();
  });

  it("updates domain and adminDomain with fallback values if unset", async () => {
    mockCfg.spec!.expose.domain = "###ZARF_VAR_DOMAIN###";
    mockCfg.spec!.expose.adminDomain = "###ZARF_VAR_ADMIN_DOMAIN###";

    await updateCfg(mockCfg, ConfigAction.LOAD);

    expect(UDSConfig.domain).toBe("uds.dev");
    expect(UDSConfig.adminDomain).toBe("admin.uds.dev");
  });

  it("does not call unnecessary updates if no values change", async () => {
    // Set UDSConfig to match mockCfg
    UDSConfig.caCert = btoa("mock-ca-cert");
    UDSConfig.kubeApiCIDR = "mock-cidr";
    UDSConfig.kubeNodeCIDRs = ["mock-node-cidrs"];
    UDSConfig.domain = "mock-domain";
    UDSConfig.adminDomain = "mock-admin-domain";
    UDSConfig.allowAllNSExemptions = true;

    await updateCfg(mockCfg, ConfigAction.UPDATE);

    expect(reconcileAuthservice).not.toHaveBeenCalled();
    expect(initAPIServerCIDR).not.toHaveBeenCalled();
    expect(initAllNodesTarget).not.toHaveBeenCalled();
  });

  it("does not call netpol updates if no values change", async () => {
    // Set mockSecret to match UDSConfig data
    mockCfg.spec!.networking!.kubeApiCIDR = "";
    mockCfg.spec!.networking!.kubeNodeCIDRs = [];

    await updateCfg(mockCfg, ConfigAction.UPDATE);

    expect(initAPIServerCIDR).not.toHaveBeenCalled();
    expect(initAllNodesTarget).not.toHaveBeenCalled();
  });

  it("should not update cluster resources during initial load", async () => {
    mockCfg.spec!.networking!.kubeApiCIDR = "diff-cidr";
    mockCfg.spec!.networking!.kubeNodeCIDRs = ["diff-cidr"];
    await updateCfg(mockCfg, ConfigAction.LOAD);
    await updateCfgSecrets(mockSecret, ConfigAction.LOAD);

    expect(initAPIServerCIDR).not.toHaveBeenCalled();
    expect(initAllNodesTarget).not.toHaveBeenCalled();
    expect(reconcileAuthservice).not.toHaveBeenCalled();
  });
});
