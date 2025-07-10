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
import { loadUDSConfig, UDSConfig, updateCfg, updateCfgSecrets } from "./config";
import { mockClusterConfGet, mockSecretGet } from "./test-helpers";

// Mock dependencies

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

const mockCfg: ClusterConfig = {
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

const mockSecret: kind.Secret = {
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
  });

  it("loads initial config", async () => {
    mockClusterConfGet.mockResolvedValue(mockCfg );
    mockSecretGet.mockResolvedValue(mockSecret);
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

    try {
      await loadUDSConfig();
    } catch (e) {
      expect(e.message).toBe("No ClusterConfig found");
    }
  });

  it("does not throw error because no config secret", async () => {
    mockClusterConfGet.mockResolvedValue(mockCfg);
    mockSecretGet.mockResolvedValue(undefined);

    await loadUDSConfig();

    expect(UDSConfig.caCert).toBe(btoa("mock-ca-cert"));
    expect(UDSConfig.kubeApiCIDR).toBe("mock-cidr");
    expect(UDSConfig.kubeNodeCIDRs).toStrictEqual(["mock-node-cidrs"]);
    expect(UDSConfig.domain).toBe("mock-domain");
    expect(UDSConfig.adminDomain).toBe("mock-admin-domain");
    expect(UDSConfig.allowAllNSExemptions).toBe(true);
    expect(UDSConfig.authserviceRedisUri).toBe("");
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
    mockSecretGet.mockResolvedValue(mockSecret);

    try {
      await loadUDSConfig();
    } catch (e) {
      expect(e.message).toBe("ClusterConfig: caCert must be base64 encoded; found invalid value");
    }
  });
});

describe("updateUDSConfig", () => {
  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();
    UDSConfig.caCert = "";
    UDSConfig.authserviceRedisUri = "";
    UDSConfig.kubeApiCIDR = "";
    UDSConfig.kubeNodeCIDRs = [];
    UDSConfig.domain = "";
    UDSConfig.adminDomain = "";
    UDSConfig.allowAllNSExemptions = false;
  });

  it("handles update to operator-config secret and updates UDSConfig secret values", async () => {
    await updateCfgSecrets(mockSecret);

    expect(UDSConfig.authserviceRedisUri).toBe("mock-redis-uri");
  });

  it("handles updates to ClusterConfig and updates UDSConfig", async () => {
    await updateCfg(mockCfg);

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

      await updateCfg(mockCfg);

      expect(reconcileAuthservice).toHaveBeenCalledWith({
        name: "global-config-update",
        action: expect.any(String),
        trustedCA: "mock-ca-cert",
        redisUri: "",
      });
    });

    it("calls if CA Cert changes to empty string (dev mode)", async () => {
      UDSConfig.caCert = "old-ca-cert";
      const cfg = {
        ...mockCfg,
        spec: { ...mockCfg.spec, expose: { caCert: "###ZARF_VAR_CA_CERT###" } },
      } as ClusterConfig;

      await updateCfg(cfg);

      expect(reconcileAuthservice).toHaveBeenCalledWith({
        name: "global-config-update",
        action: expect.any(String),
        trustedCA: "",
        redisUri: "",
      });
    });

    it("does not call if CA Cert key is undefined", async () => {
      UDSConfig.caCert = "old-ca-cert";
      const cfg = { ...mockCfg, spec: { ...mockCfg.spec, expose: {} } } as ClusterConfig;

      await updateCfg(cfg);

      expect(reconcileAuthservice).toHaveBeenCalledWith({
        name: "global-config-update",
        action: expect.any(String),
        trustedCA: "",
        redisUri: "",
      });
    });

    it("does not call if CA Cert is still empty string (dev mode)", async () => {
      UDSConfig.caCert = "";
      const cfg = {
        ...mockCfg,
        spec: { ...mockCfg.spec, expose: { caCert: "###ZARF_VAR_CA_CERT###" } },
      } as ClusterConfig;

      await updateCfg(cfg);

      expect(reconcileAuthservice).not.toHaveBeenCalled();
    });

    it("calls if Redis URI changes", async () => {
      UDSConfig.caCert = btoa("old-ca-cert");
      UDSConfig.authserviceRedisUri = "old-redis-uri";

      await updateCfgSecrets(mockSecret);

      expect(reconcileAuthservice).toHaveBeenCalledWith({
        name: "global-config-update",
        action: expect.any(String),
        trustedCA: "old-ca-cert",
        redisUri: "mock-redis-uri",
      });
    });

    it("calls if setting Redis URI to empty string", async () => {
      UDSConfig.authserviceRedisUri = "old-redis-uri";
      const emptyRedisURI = { ...mockSecret, data: { AUTHSERVICE_REDIS_URI: btoa("") } };

      await updateCfgSecrets(emptyRedisURI);

      expect(reconcileAuthservice).toHaveBeenCalledWith({
        name: "global-config-update",
        action: expect.any(String),
        trustedCA: "",
        redisUri: "",
      });
    });

    it("calls if setting Redis URI to empty string (dev mode)", async () => {
      UDSConfig.authserviceRedisUri = "old-redis-uri";
      const emptyRedisURI = {
        ...mockSecret,
        data: { AUTHSERVICE_REDIS_URI: btoa("###ZARF_VAR_AUTHSERVICE_REDIS_URI###") },
      };

      await updateCfgSecrets(emptyRedisURI);

      expect(reconcileAuthservice).toHaveBeenCalledWith({
        name: "global-config-update",
        action: expect.any(String),
        trustedCA: "",
        redisUri: "",
      });
    });

    it("calls if AUTHSERVICE_REDIS_URI key is missing and sets to empty string", async () => {
      UDSConfig.authserviceRedisUri = "original";
      const emptyRedisURI = { ...mockSecret, data: {} };

      await updateCfgSecrets(emptyRedisURI);

      expect(reconcileAuthservice).toHaveBeenCalledWith({
        name: "global-config-update",
        action: expect.any(String),
        trustedCA: "",
        redisUri: "",
      });
    });

    it("does not call if Redis URI is still empty string (dev mode)", async () => {
      UDSConfig.authserviceRedisUri = "";
      const emptyRedisURI = {
        ...mockSecret,
        data: { AUTHSERVICE_REDIS_URI: btoa("###ZARF_VAR_AUTHSERVICE_REDIS_URI###") },
      };

      await updateCfgSecrets(emptyRedisURI);

      expect(reconcileAuthservice).not.toHaveBeenCalled();
    });
  });

  it("should call initAPIServerCIDR if KUBEAPI_CIDR changes", async () => {
    UDSConfig.kubeApiCIDR = "old-cidr";

    await updateCfg(mockCfg);

    expect(initAPIServerCIDR).toHaveBeenCalled();
  });

  it("should call initAllNodesTarget if KUBENODE_CIDRS changes", async () => {
    UDSConfig.kubeNodeCIDRs = ["old-node-cidrs"];

    await updateCfg(mockCfg);

    expect(initAllNodesTarget).toHaveBeenCalled();
  });

  it("updates domain and adminDomain with fallback values if unset", async () => {
    mockCfg.spec!.expose.domain = "###ZARF_VAR_DOMAIN###";
    mockCfg.spec!.expose.adminDomain = "###ZARF_VAR_ADMIN_DOMAIN###";

    await updateCfg(mockCfg);

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

    await updateCfg(mockCfg);

    expect(reconcileAuthservice).not.toHaveBeenCalled();
    expect(initAPIServerCIDR).not.toHaveBeenCalled();
    expect(initAllNodesTarget).not.toHaveBeenCalled();
  });

  it("does not call netpol updates if no values change", async () => {
    // Set mockSecret to match UDSConfig data
    mockCfg.spec!.networking!.kubeApiCIDR = "";
    mockCfg.spec!.networking!.kubeNodeCIDRs = [];

    await updateCfg(mockCfg);

    expect(initAPIServerCIDR).not.toHaveBeenCalled();
    expect(initAllNodesTarget).not.toHaveBeenCalled();
  });
});
