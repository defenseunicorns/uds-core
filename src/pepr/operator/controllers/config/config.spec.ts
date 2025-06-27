/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { kind } from "pepr";

import { KubernetesListObject } from "kubernetes-fluent-client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { UDSConfig } from "../../../config";
import { ClusterConfig } from "../../crd";
import { reconcileAuthservice } from "../keycloak/authservice/authservice";
import { initAPIServerCIDR } from "../network/generators/kubeAPI";
import { initAllNodesTarget } from "../network/generators/kubeNodes";
import { loadUDSConfig, updateCfg, updateCfgSecrets } from "./config";

// Mock dependencies
vi.mock("../../../config", () => ({
  UDSConfig: {
    caCert: "",
    authserviceRedisUri: "",
    kubeApiCidr: "",
    kubeNodeCidrs: "",
    domain: "",
    adminDomain: "",
    allowAllNSExemptions: false,
  },
}));

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

jest.mock("pepr", () => {
  const mockCfg = {
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
  } as ClusterConfig;

  const mockSecret = {
    metadata: {
      name: "uds-operator-config",
      namespace: "pepr-system",
    },
    data: {
      AUTHSERVICE_REDIS_URI: btoa("mock-redis-uri"),
    },
  } as kind.Secret;

  return {
    K8s: jest
      .fn()
      // valid ClusterConfig and config secret
      .mockReturnValueOnce({
        InNamespace: jest.fn().mockReturnValue({
          Get: jest
            .fn<() => Promise<KubernetesListObject<ClusterConfig>>>()
            .mockResolvedValue({ items: [mockCfg] }),
        }),
      })
      .mockReturnValueOnce({
        InNamespace: jest.fn().mockReturnValue({
          Get: jest.fn<() => Promise<kind.Secret>>().mockResolvedValue(mockSecret),
        }),
      })
      // too many ClusterConfigs (ERROR)
      .mockReturnValueOnce({
        InNamespace: jest.fn().mockReturnValue({
          Get: jest
            .fn<() => Promise<KubernetesListObject<ClusterConfig>>>()
            .mockResolvedValue({ items: [mockCfg, mockCfg] }),
        }),
      })
      .mockReturnValueOnce({
        InNamespace: jest.fn().mockReturnValue({
          Get: jest.fn<() => Promise<kind.Secret>>().mockResolvedValue(mockSecret),
        }),
      })
      // no ClusterConfig (ERROR)
      .mockReturnValueOnce({
        InNamespace: jest.fn().mockReturnValue({
          Get: jest
            .fn<() => Promise<KubernetesListObject<ClusterConfig>>>()
            .mockResolvedValue({ items: [] }),
        }),
      })
      .mockReturnValueOnce({
        InNamespace: jest.fn().mockReturnValue({
          Get: jest.fn<() => Promise<kind.Secret>>().mockResolvedValue(mockSecret),
        }),
      }),
    kind: {
      Secret: "Secret",
    },
  };
});

describe("initial config load", () => {
  beforeEach(() => {
    process.env.PEPR_WATCH_MODE = "true";
    process.env.PEPR_MODE = "dev";
  });

  it("loads initial config", async () => {
    await loadUDSConfig();

    expect(UDSConfig.caCert).toBe(btoa("mock-ca-cert"));
    expect(UDSConfig.kubeApiCidr).toBe("mock-cidr");
    expect(UDSConfig.kubeNodeCidrs).toStrictEqual(["mock-node-cidrs"]);
    expect(UDSConfig.domain).toBe("mock-domain");
    expect(UDSConfig.adminDomain).toBe("mock-admin-domain");
    expect(UDSConfig.allowAllNSExemptions).toBe(true);
    expect(UDSConfig.authserviceRedisUri).toBe("mock-redis-uri");
  });

  it("throws error because too many configs", async () => {
    try {
      await loadUDSConfig();
    } catch (e) {
      expect(e.message).toBe(
        "ClusterConfig Processing: only one ClusterConfig is allowed -- found: 2",
      );
    }
  });

  it("throws error because no config", async () => {
    try {
      await loadUDSConfig();
    } catch (e) {
      expect(e.message).toBe("No ClusterConfig found");
    }
  });
});

describe("updateUDSConfig", () => {
  let mockSecret: kind.Secret;
  let mockCfg: ClusterConfig;

  beforeEach(() => {
    mockSecret = {
      data: {
        AUTHSERVICE_REDIS_URI: btoa("mock-redis-uri"),
      },
    };

    mockCfg = {
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

    // Reset mocks
    vi.clearAllMocks();
    UDSConfig.caCert = "";
    UDSConfig.authserviceRedisUri = "";
    UDSConfig.kubeApiCidr = "";
    UDSConfig.kubeNodeCidrs = [];
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
    expect(UDSConfig.kubeApiCidr).toBe("mock-cidr");
    expect(UDSConfig.kubeNodeCidrs).toStrictEqual(["mock-node-cidrs"]);
    expect(UDSConfig.domain).toBe("mock-domain");
    expect(UDSConfig.adminDomain).toBe("mock-admin-domain");
    expect(UDSConfig.allowAllNSExemptions).toBe(true);
  });

  it("calls reconcileAuthservice if CA Cert changes", async () => {
    UDSConfig.caCert = "old-ca-cert";
    UDSConfig.authserviceRedisUri = "old-redis-uri";

    await updateCfg(mockCfg);

    expect(reconcileAuthservice).toHaveBeenCalledWith({
      name: "global-config-update",
      action: expect.any(String),
      trustedCA: "mock-ca-cert",
      redisUri: UDSConfig.authserviceRedisUri,
    });
  });

  it("calls reconcileAuthservice if Redis URI changes", async () => {
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

  it("should call initAPIServerCIDR if KUBEAPI_CIDR changes", async () => {
    UDSConfig.kubeApiCidr = "old-cidr";

    await updateCfg(mockCfg);

    expect(initAPIServerCIDR).toHaveBeenCalled();
  });

  it("should call initAllNodesTarget if KUBENODE_CIDRS changes", async () => {
    UDSConfig.kubeNodeCidrs = ["old-node-cidrs"];

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
    UDSConfig.kubeApiCidr = "mock-cidr";
    UDSConfig.kubeNodeCidrs = ["mock-node-cidrs"];
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
    mockCfg.spec!.networking!.kubeapiCIDR = "";
    mockCfg.spec!.networking!.kubenodeCIDRS = [];

    await updateCfg(mockCfg);

    expect(initAPIServerCIDR).not.toHaveBeenCalled();
    expect(initAllNodesTarget).not.toHaveBeenCalled();
  });

  it("sets caCert to an empty string if the value is a placeholder", async () => {
    mockCfg.spec!.expose.caCert = "###ZARF_VAR_CA_CERT###";

    await updateCfg(mockCfg);
    expect(UDSConfig.caCert).toBe("");
  });
});
