/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { kind } from "pepr";
import { UDSConfig } from "../../../config";
import { reconcileAuthservice } from "../keycloak/authservice/authservice";
import { initAPIServerCIDR } from "../network/generators/kubeAPI";
import { initAllNodesTarget } from "../network/generators/kubeNodes";
import { updateUDSConfig } from "./config";

// Mock dependencies
jest.mock("../../../config", () => ({
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

jest.mock("../keycloak/authservice/authservice", () => ({
  reconcileAuthservice: jest.fn(),
}));

jest.mock("../network/generators/kubeAPI", () => ({
  initAPIServerCIDR: jest.fn(),
}));

jest.mock("../network/generators/kubeNodes", () => ({
  initAllNodesTarget: jest.fn(),
}));

jest.mock("../../../logger", () => {
  const mockLogger = {
    warn: jest.fn(),
    level: jest.fn(),
    fatal: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
    trace: jest.fn(),
  };
  return {
    Component: {
      OPERATOR_CONFIG: "operator-config",
    },
    setupLogger: jest.fn(() => mockLogger),
  };
});

describe("updateUDSConfig", () => {
  let mockSecret: kind.Secret;

  beforeEach(() => {
    mockSecret = {
      data: {
        // This is "double base64 encoded" because the user will provide
        // a base64 encoded CA cert, which is then base64 encoded again for the k8s secret
        UDS_CA_CERT: btoa(btoa("mock-ca-cert")),
        AUTHSERVICE_REDIS_URI: btoa("mock-redis-uri"),
        KUBEAPI_CIDR: btoa("mock-cidr"),
        KUBENODE_CIDRS: btoa("mock-node-cidrs"),
        UDS_DOMAIN: btoa("mock-domain"),
        UDS_ADMIN_DOMAIN: btoa("mock-admin-domain"),
        UDS_ALLOW_ALL_NS_EXEMPTIONS: btoa("true"),
      },
    };

    // Reset mocks
    jest.clearAllMocks();
    UDSConfig.caCert = "";
    UDSConfig.authserviceRedisUri = "";
    UDSConfig.kubeApiCidr = "";
    UDSConfig.kubeNodeCidrs = "";
    UDSConfig.domain = "";
    UDSConfig.adminDomain = "";
    UDSConfig.allowAllNSExemptions = false;
  });

  it("should decode the secret data and update UDSConfig", async () => {
    await updateUDSConfig(mockSecret);

    expect(UDSConfig.caCert).toBe(btoa("mock-ca-cert"));
    expect(UDSConfig.authserviceRedisUri).toBe("mock-redis-uri");
    expect(UDSConfig.kubeApiCidr).toBe("mock-cidr");
    expect(UDSConfig.kubeNodeCidrs).toBe("mock-node-cidrs");
    expect(UDSConfig.domain).toBe("mock-domain");
    expect(UDSConfig.adminDomain).toBe("mock-admin-domain");
    expect(UDSConfig.allowAllNSExemptions).toBe(true);
  });

  it("should call reconcileAuthservice if CA Cert or Redis URI changes", async () => {
    UDSConfig.caCert = "old-ca-cert";
    UDSConfig.authserviceRedisUri = "old-redis-uri";

    await updateUDSConfig(mockSecret);

    expect(reconcileAuthservice).toHaveBeenCalledWith({
      name: "global-config-update",
      action: expect.any(String),
      trustedCA: "mock-ca-cert",
      redisUri: "mock-redis-uri",
    });
  });

  it("should call initAPIServerCIDR if KUBEAPI_CIDR changes", async () => {
    UDSConfig.kubeApiCidr = "old-cidr";

    await updateUDSConfig(mockSecret);

    expect(initAPIServerCIDR).toHaveBeenCalled();
  });

  it("should call initAllNodesTarget if KUBENODE_CIDRS changes", async () => {
    UDSConfig.kubeNodeCidrs = "old-node-cidrs";

    await updateUDSConfig(mockSecret);

    expect(initAllNodesTarget).toHaveBeenCalled();
  });

  it("should update domain and adminDomain with fallback values if unset", async () => {
    if (mockSecret.data) {
      mockSecret.data.UDS_DOMAIN = btoa("###ZARF_VAR_DOMAIN###");
      mockSecret.data.UDS_ADMIN_DOMAIN = btoa("###ZARF_VAR_ADMIN_DOMAIN###");
    }

    await updateUDSConfig(mockSecret);

    expect(UDSConfig.domain).toBe("uds.dev");
    expect(UDSConfig.adminDomain).toBe("admin.uds.dev");
  });

  it("should not call unnecessary updates if no values change", async () => {
    // Set UDSConfig to match mockSecret data
    UDSConfig.caCert = btoa("mock-ca-cert");
    UDSConfig.authserviceRedisUri = "mock-redis-uri";
    UDSConfig.kubeApiCidr = "mock-cidr";
    UDSConfig.kubeNodeCidrs = "mock-node-cidrs";
    UDSConfig.domain = "mock-domain";
    UDSConfig.adminDomain = "mock-admin-domain";
    UDSConfig.allowAllNSExemptions = true;

    await updateUDSConfig(mockSecret);

    expect(reconcileAuthservice).not.toHaveBeenCalled();
    expect(initAPIServerCIDR).not.toHaveBeenCalled();
    expect(initAllNodesTarget).not.toHaveBeenCalled();
  });

  it("should not call netpol updates if no values change", async () => {
    // Set mockSecret to match UDSConfig data
    mockSecret = {
      data: {
        UDS_CA_CERT: btoa(btoa("mock-ca-cert")),
        AUTHSERVICE_REDIS_URI: btoa("mock-redis-uri"),
        KUBEAPI_CIDR: "",
        KUBENODE_CIDRS: "",
        UDS_DOMAIN: btoa("mock-domain"),
        UDS_ADMIN_DOMAIN: btoa("mock-admin-domain"),
        UDS_ALLOW_ALL_NS_EXEMPTIONS: btoa("true"),
      },
    };
    await updateUDSConfig(mockSecret);

    expect(initAPIServerCIDR).not.toHaveBeenCalled();
    expect(initAllNodesTarget).not.toHaveBeenCalled();
  });

  it("should set caCert to an empty string if the value is a placeholder", async () => {
    if (mockSecret.data) {
      mockSecret.data.UDS_CA_CERT = btoa("###ZARF_VAR_CA_CERT###");
    }
    await updateUDSConfig(mockSecret);
    expect(UDSConfig.caCert).toBe("");
  });

  it("should log an error and set caCert to an empty string if the value is not valid base64", async () => {
    if (mockSecret.data) {
      mockSecret.data.UDS_CA_CERT = btoa("invalid-base64");
    }
    const { setupLogger } = require("../../../logger");
    const mockLogger = setupLogger();

    await updateUDSConfig(mockSecret);
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining("Invalid CA Cert provided in uds-operator-config secret"),
    );
    expect(UDSConfig.caCert).toBe("");
  });
});
