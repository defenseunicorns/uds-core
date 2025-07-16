/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { K8s } from "pepr";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Direction, Gateway, UDSPackage } from "../../crd";
import { IstioState } from "../istio/namespace";
import { findMatchingClient, getPolicyDescription, networkPolicies } from "./policies";

// Mock dependencies
vi.mock("pepr", () => {
  const mockApply = vi.fn().mockResolvedValue({});
  return {
    K8s: vi.fn().mockImplementation(() => ({
      Apply: mockApply,
    })),
    kind: {
      NetworkPolicy: "NetworkPolicy",
    },
  };
});

vi.mock("../../../logger", () => ({
  setupLogger: vi.fn().mockReturnValue({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
  Component: {
    OPERATOR_NETWORK: "OPERATOR_NETWORK",
  },
}));

vi.mock("../../utils/waypoint", () => ({
  getWaypointName: vi.fn().mockImplementation(clientId => `${clientId}-waypoint`),
  getPodSelector: vi.fn().mockImplementation((pkg, selector, waypointName) => ({
    "gateway.networking.k8s.io/gateway-name": waypointName,
  })),
  shouldUseAmbientWaypoint: vi.fn().mockReturnValue(true),
}));

vi.mock("../utils", () => ({
  getOwnerRef: vi.fn().mockReturnValue([{ kind: "UDSPackage", name: "test-pkg" }]),
  purgeOrphans: vi.fn().mockResolvedValue({}),
  sanitizeResourceName: vi.fn().mockImplementation(name => name),
}));

vi.mock("./defaults/default-deny-all", () => ({
  defaultDenyAll: vi.fn().mockImplementation(namespace => ({
    apiVersion: "networking.k8s.io/v1",
    kind: "NetworkPolicy",
    metadata: {
      name: "default-deny-all",
      namespace,
    },
    spec: {},
  })),
}));

vi.mock("./defaults/allow-egress-dns", () => ({
  allowEgressDNS: vi.fn().mockImplementation(namespace => ({
    apiVersion: "networking.k8s.io/v1",
    kind: "NetworkPolicy",
    metadata: {
      name: "allow-egress-dns",
      namespace,
    },
    spec: {},
  })),
}));

vi.mock("./defaults/allow-egress-istiod", () => ({
  allowEgressIstiod: vi.fn().mockImplementation(namespace => ({
    apiVersion: "networking.k8s.io/v1",
    kind: "NetworkPolicy",
    metadata: {
      name: "allow-egress-istiod",
      namespace,
    },
    spec: {},
  })),
}));

vi.mock("./defaults/allow-ingress-sidecar-monitoring", () => ({
  allowIngressSidecarMonitoring: vi.fn().mockImplementation(namespace => ({
    apiVersion: "networking.k8s.io/v1",
    kind: "NetworkPolicy",
    metadata: {
      name: "allow-ingress-sidecar-monitoring",
      namespace,
    },
    spec: {},
  })),
}));

vi.mock("./generators/ambientHealthprobes", () => ({
  allowAmbientHealthprobes: vi.fn().mockImplementation(namespace => ({
    apiVersion: "networking.k8s.io/v1",
    kind: "NetworkPolicy",
    metadata: {
      name: "allow-ambient-healthprobes",
      namespace,
    },
    spec: {},
  })),
}));

vi.mock("./generate", () => ({
  generate: vi.fn().mockImplementation((namespace, policy) => ({
    apiVersion: "networking.k8s.io/v1",
    kind: "NetworkPolicy",
    metadata: {
      name: `generated-${policy.description || "policy"}`,
      namespace,
    },
    spec: {
      ingress:
        policy.direction === Direction.Ingress ? [{ ports: [{ port: policy.port }] }] : undefined,
      egress:
        policy.direction === Direction.Egress ? [{ ports: [{ port: policy.port }] }] : undefined,
    },
  })),
}));

describe("findMatchingClient", () => {
  it("should return undefined when serviceSelector is undefined", () => {
    const pkg: UDSPackage = {
      apiVersion: "uds.dev/v1",
      kind: "UDSPackage",
      metadata: {
        name: "test-pkg",
        namespace: "test-ns",
      },
      spec: {},
    };

    const result = findMatchingClient(pkg, undefined as unknown as Record<string, string>);
    expect(result).toBeUndefined();
  });

  it("should return undefined when no SSO clients match the selector", () => {
    const pkg: UDSPackage = {
      apiVersion: "uds.dev/v1",
      kind: "UDSPackage",
      metadata: {
        name: "test-pkg",
        namespace: "test-ns",
      },
      spec: {
        sso: [
          {
            clientId: "client1",
            enableAuthserviceSelector: { app: "auth-app-1" },
            name: "client-1",
          },
          {
            clientId: "client2",
            enableAuthserviceSelector: { "app.kubernetes.io/name": "auth-app-2" },
            name: "client-2",
          },
        ],
      },
    };

    const result = findMatchingClient(pkg, { app: "different-app" });
    expect(result).toBeUndefined();
  });

  it("should find matching client by app label", () => {
    const pkg: UDSPackage = {
      apiVersion: "uds.dev/v1",
      kind: "UDSPackage",
      metadata: {
        name: "test-pkg",
        namespace: "test-ns",
      },
      spec: {
        sso: [
          {
            clientId: "client1",
            enableAuthserviceSelector: { app: "auth-app-1" },
            name: "client-1",
          },
          {
            clientId: "client2",
            enableAuthserviceSelector: { "app.kubernetes.io/name": "auth-app-2" },
            name: "client-2",
          },
        ],
      },
    };

    const result = findMatchingClient(pkg, { app: "auth-app-1" });
    expect(result).toBeDefined();
    expect(result?.clientId).toBe("client1");
  });

  it("should find matching client by app.kubernetes.io/name label", () => {
    const pkg: UDSPackage = {
      apiVersion: "uds.dev/v1",
      kind: "UDSPackage",
      metadata: {
        name: "test-pkg",
        namespace: "test-ns",
      },
      spec: {
        sso: [
          {
            clientId: "client1",
            enableAuthserviceSelector: { app: "auth-app-1" },
            name: "client-1",
          },
          {
            clientId: "client2",
            enableAuthserviceSelector: { "app.kubernetes.io/name": "auth-app-2" },
            name: "client-2",
          },
        ],
      },
    };

    const result = findMatchingClient(pkg, { "app.kubernetes.io/name": "auth-app-2" });
    expect(result).toBeDefined();
    expect(result?.clientId).toBe("client2");
  });
});

describe("getPolicyDescription", () => {
  it("should return ambient description when isAmbient is true and clientId is provided", () => {
    const port = 8080;
    const clientId = "test-client";
    const gateway = "tenant";
    const isAmbient = true;

    const result = getPolicyDescription(port, clientId, gateway, isAmbient);
    expect(result).toBe("8080-test-client Istio tenant gateway (ambient)");
  });

  it("should return standard description when isAmbient is false", () => {
    const port = 8080;
    const clientId = "test-client";
    const gateway = "tenant";
    const isAmbient = false;

    const result = getPolicyDescription(port, clientId, gateway, isAmbient);
    expect(result).toBe("8080-service Istio tenant gateway");
  });

  it("should return standard description when clientId is undefined", () => {
    const port = 8080;
    const clientId = undefined;
    const gateway = "tenant";
    const isAmbient = true;

    const result = getPolicyDescription(port, clientId, gateway, isAmbient);
    expect(result).toBe("8080-service Istio tenant gateway");
  });

  it("should handle different gateway types", () => {
    const port = 8080;
    const clientId = "test-client";
    const gateway = "public";
    const isAmbient = true;

    const result = getPolicyDescription(port, clientId, gateway, isAmbient);
    expect(result).toBe("8080-test-client Istio public gateway (ambient)");
  });
});

describe("networkPolicies", () => {
  // Reset mocks before each test
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should generate default policies", async () => {
    // Create a minimal UDSPackage
    const pkg: UDSPackage = {
      apiVersion: "uds.dev/v1",
      kind: "UDSPackage",
      metadata: {
        name: "test-pkg",
        namespace: "test-ns",
        generation: 1,
      },
      spec: {},
    };

    const namespace = "test-namespace";
    const istioMode = "none";

    const policies = await networkPolicies(pkg, namespace, istioMode);

    // Should have default policies (deny-all and egress-dns)
    expect(policies.length).toBe(2);
    expect(policies[0].metadata!.name).toContain("deny");
    expect(policies[1].metadata!.name).toContain("allow");

    // Verify K8s.Apply was called for each policy
    expect(K8s).toHaveBeenCalledTimes(2);
  });

  it("should generate sidecar mode policies", async () => {
    const pkg: UDSPackage = {
      apiVersion: "uds.dev/v1",
      kind: "UDSPackage",
      metadata: {
        name: "test-pkg",
        namespace: "test-ns",
        generation: 1,
      },
      spec: {},
    };

    const namespace = "test-namespace";
    const istioMode = IstioState.Sidecar;

    const policies = await networkPolicies(pkg, namespace, istioMode);

    // Should have default policies plus sidecar-specific policies
    expect(policies.length).toBe(4);

    // Verify K8s.Apply was called for each policy
    expect(K8s).toHaveBeenCalledTimes(4);
  });

  it("should generate ambient mode policies", async () => {
    const pkg: UDSPackage = {
      apiVersion: "uds.dev/v1",
      kind: "UDSPackage",
      metadata: {
        name: "test-pkg",
        namespace: "test-ns",
        generation: 1,
      },
      spec: {},
    };

    const namespace = "test-namespace";
    const istioMode = IstioState.Ambient;

    const policies = await networkPolicies(pkg, namespace, istioMode);

    // Should have default policies plus ambient-specific policies
    expect(policies.length).toBe(3);

    // Verify K8s.Apply was called for each policy
    expect(K8s).toHaveBeenCalledTimes(3);
  });

  it("should generate policies for custom allow rules", async () => {
    const pkg: UDSPackage = {
      apiVersion: "uds.dev/v1",
      kind: "UDSPackage",
      metadata: {
        name: "test-pkg",
        namespace: "test-ns",
        generation: 1,
      },
      spec: {
        network: {
          allow: [
            {
              direction: Direction.Ingress,
              selector: { app: "test-app" },
              remoteNamespace: "test-remote",
              remoteSelector: { app: "remote-app" },
              port: 8080,
              description: "test-policy",
            },
          ],
        },
      },
    };

    const namespace = "test-namespace";
    const istioMode = "none";

    const policies = await networkPolicies(pkg, namespace, istioMode);

    // Should have default policies plus custom policy
    expect(policies.length).toBe(3);

    // Verify K8s.Apply was called for each policy
    expect(K8s).toHaveBeenCalledTimes(3);
  });

  it("should generate policies for exposed services", async () => {
    const pkg: UDSPackage = {
      apiVersion: "uds.dev/v1",
      kind: "UDSPackage",
      metadata: {
        name: "test-pkg",
        namespace: "test-ns",
        generation: 1,
      },
      spec: {
        network: {
          expose: [
            {
              gateway: Gateway.Tenant,
              port: 8080,
              selector: { app: "test-app" },
              host: "",
            },
          ],
        },
      },
    };

    const namespace = "test-namespace";
    const istioMode = "none";

    const policies = await networkPolicies(pkg, namespace, istioMode);

    // Should have default policies plus expose policy
    expect(policies.length).toBe(3);

    // Verify K8s.Apply was called for each policy
    expect(K8s).toHaveBeenCalledTimes(3);
  });

  it("should generate policies for SSO clients", async () => {
    const pkg: UDSPackage = {
      apiVersion: "uds.dev/v1",
      kind: "UDSPackage",
      metadata: {
        name: "test-pkg",
        namespace: "test-ns",
        generation: 1,
      },
      spec: {
        sso: [
          {
            clientId: "test-client",
            name: "Test Client",
            enableAuthserviceSelector: { app: "test-app" },
          },
        ],
      },
    };

    const namespace = "test-namespace";
    const istioMode = "none";

    const policies = await networkPolicies(pkg, namespace, istioMode);

    // Should have default policies plus authservice and keycloak policies
    expect(policies.length).toBe(4);

    // Verify K8s.Apply was called for each policy
    expect(K8s).toHaveBeenCalledTimes(4);
  });

  it("should generate policies for SSO clients in ambient mode", async () => {
    const pkg: UDSPackage = {
      apiVersion: "uds.dev/v1",
      kind: "UDSPackage",
      metadata: {
        name: "test-pkg",
        namespace: "test-ns",
        generation: 1,
      },
      spec: {
        sso: [
          {
            clientId: "test-client",
            name: "Test Client",
            enableAuthserviceSelector: { app: "test-app" },
          },
        ],
      },
    };

    const namespace = "test-namespace";
    const istioMode = IstioState.Ambient;

    const policies = await networkPolicies(pkg, namespace, istioMode);

    // Should have default policies plus ambient policy plus authservice, keycloak, and istiod policies
    expect(policies.length).toBe(6);

    // Verify K8s.Apply was called for each policy
    expect(K8s).toHaveBeenCalledTimes(6);
  });

  it("should generate policies for monitors", async () => {
    const pkg: UDSPackage = {
      apiVersion: "uds.dev/v1",
      kind: "UDSPackage",
      metadata: {
        name: "test-pkg",
        namespace: "test-ns",
        generation: 1,
      },
      spec: {
        monitor: [
          {
            selector: { app: "test-app" },
            targetPort: 9090,
            portName: "",
          },
        ],
      },
    };

    const namespace = "test-namespace";
    const istioMode = "none";

    const policies = await networkPolicies(pkg, namespace, istioMode);

    // Should have default policies plus monitor policy
    expect(policies.length).toBe(3);

    // Verify K8s.Apply was called for each policy
    expect(K8s).toHaveBeenCalledTimes(3);
  });

  it("should add port 15008 to ingress policies", async () => {
    const pkg: UDSPackage = {
      apiVersion: "uds.dev/v1",
      kind: "UDSPackage",
      metadata: {
        name: "test-pkg",
        namespace: "test-ns",
        generation: 1,
      },
      spec: {
        network: {
          expose: [
            {
              gateway: Gateway.Tenant,
              port: 8080,
              selector: { app: "test-app" },
              host: "",
            },
          ],
        },
      },
    };

    const namespace = "test-namespace";
    const istioMode = "none";

    // Create a mock for K8s.Apply that we can inspect later
    const mockApply = vi.fn().mockResolvedValue({});

    // Mock the K8s client with a type assertion to a more specific type
    // This avoids using 'any' while still allowing the test to work
    vi.mocked(K8s).mockImplementation(() => {
      // Create the mock object with all required methods
      const k8sMock = {
        Apply: mockApply,
        Get: vi.fn().mockResolvedValue({ items: [] }),
        Delete: vi.fn(),
        Logs: vi.fn(),
        Proxy: vi.fn(),
        Watch: vi.fn(),
        List: vi.fn(),
        Evict: vi.fn(),
        Create: vi.fn(),
        Patch: vi.fn(),
        PatchStatus: vi.fn(),
        Raw: vi.fn(),
        // Filter methods that return this
        InNamespace: vi.fn().mockReturnThis(),
        WithLabel: vi.fn().mockReturnThis(),
        WithField: vi.fn().mockReturnThis(),
      };

      // Use a more specific type than 'any'
      return k8sMock as unknown as ReturnType<typeof import("pepr").K8s>;
    });

    await networkPolicies(pkg, namespace, istioMode);

    // Verify port 15008 was added to the ingress policy
    const applyCalls = mockApply.mock.calls;
    const ingressPolicies = applyCalls.filter(call => call[0].spec?.ingress);

    for (const call of ingressPolicies) {
      const policy = call[0];
      for (const ingress of policy.spec.ingress) {
        if (ingress.ports) {
          const hasTunnelPort = ingress.ports.some((port: { port: number }) => port.port === 15008);
          expect(hasTunnelPort).toBe(true);
        }
      }
    }
  });
});
