/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { V1NetworkPolicy } from "@kubernetes/client-node";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Direction, Gateway, UDSPackage } from "../../crd";
import { findMatchingClient, getGatewayPolicyDescription, networkPolicies } from "./policies";

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
  it("should return undefined when podLabels is undefined", () => {
    const pkg: UDSPackage = {
      apiVersion: "uds.dev/v1",
      kind: "UDSPackage",
      metadata: { name: "test-pkg", namespace: "test-ns" },
      spec: {},
    };
    expect(findMatchingClient(pkg, undefined as unknown as Record<string, string>)).toBeUndefined();
  });

  it("should return undefined when podLabels is empty", () => {
    const pkg: UDSPackage = {
      apiVersion: "uds.dev/v1",
      kind: "UDSPackage",
      metadata: { name: "test-pkg", namespace: "test-ns" },
      spec: {
        sso: [
          {
            clientId: "client1",
            enableAuthserviceSelector: { app: "test" },
            name: "",
          },
        ],
      },
    };
    expect(findMatchingClient(pkg, {})).toBeUndefined();
  });

  it("should return undefined when no SSO clients exist", () => {
    const pkg: UDSPackage = {
      apiVersion: "uds.dev/v1",
      kind: "UDSPackage",
      metadata: { name: "test-pkg", namespace: "test-ns" },
      spec: { sso: [] },
    };
    expect(findMatchingClient(pkg, { app: "test" })).toBeUndefined();
  });

  it("should match client by single label", () => {
    const pkg: UDSPackage = {
      apiVersion: "uds.dev/v1",
      kind: "UDSPackage",
      metadata: { name: "test-pkg", namespace: "test-ns" },
      spec: {
        sso: [
          {
            clientId: "client1",
            enableAuthserviceSelector: { app: "app1" },
            name: "",
          },
          {
            clientId: "client2",
            enableAuthserviceSelector: { "app.kubernetes.io/name": "app2" },
            name: "",
          },
        ],
      },
    };
    expect(findMatchingClient(pkg, { app: "app1" })?.clientId).toBe("client1");
  });

  it("should match client by multiple labels", () => {
    const pkg: UDSPackage = {
      apiVersion: "uds.dev/v1",
      kind: "UDSPackage",
      metadata: { name: "test-pkg", namespace: "test-ns" },
      spec: {
        sso: [
          {
            clientId: "client1",
            enableAuthserviceSelector: {
              app: "app1",
              "app.kubernetes.io/part-of": "test",
            },
            name: "",
          },
        ],
      },
    };
    expect(
      findMatchingClient(pkg, {
        app: "app1",
        "app.kubernetes.io/part-of": "test",
      })?.clientId,
    ).toBe("client1");
  });

  it("should not match when only some labels match", () => {
    const pkg: UDSPackage = {
      apiVersion: "uds.dev/v1",
      kind: "UDSPackage",
      metadata: { name: "test-pkg", namespace: "test-ns" },
      spec: {
        sso: [
          {
            clientId: "client1",
            enableAuthserviceSelector: {
              app: "app1",
              "app.kubernetes.io/part-of": "test",
            },
            name: "",
          },
        ],
      },
    };
    expect(findMatchingClient(pkg, { app: "app1" })).toBeUndefined();
  });

  it("should match first client when multiple could match", () => {
    const pkg: UDSPackage = {
      apiVersion: "uds.dev/v1",
      kind: "UDSPackage",
      metadata: { name: "test-pkg", namespace: "test-ns" },
      spec: {
        sso: [
          {
            clientId: "client1",
            enableAuthserviceSelector: { app: "app1" },
            name: "",
          },
          {
            clientId: "client2",
            enableAuthserviceSelector: { app: "app1" },
            name: "",
          },
        ],
      },
    };
    expect(findMatchingClient(pkg, { app: "app1" })?.clientId).toBe("client1");
  });

  it("should match any pod when SSO client has empty selector", () => {
    const pkg: UDSPackage = {
      apiVersion: "uds.dev/v1",
      kind: "UDSPackage",
      metadata: { name: "test-pkg", namespace: "test-ns" },
      spec: {
        sso: [
          {
            clientId: "client1",
            enableAuthserviceSelector: {},
            name: "empty-selector",
          },
        ],
      },
    };
    // Should match any pod, including empty labels
    expect(findMatchingClient(pkg, {})?.clientId).toBe("client1");
    // Should also match pods with labels
    expect(findMatchingClient(pkg, { app: "test" })?.clientId).toBe("client1");
  });
});

describe("getGatewayPolicyDescription", () => {
  it("should return ambient description when isAmbient is true", () => {
    const serviceName = "test-service";
    const port = 8080;
    const gateway = "tenant";
    const isAmbient = true;

    const result = getGatewayPolicyDescription(serviceName, port, gateway, isAmbient);
    expect(result).toBe("test-service-8080 Istio tenant gateway (ambient)");
  });

  it("should return standard description when isAmbient is false", () => {
    const serviceName = "test-service";
    const port = 8080;
    const gateway = "tenant";
    const isAmbient = false;

    const result = getGatewayPolicyDescription(serviceName, port, gateway, isAmbient);
    expect(result).toBe("test-service-8080 Istio tenant gateway");
  });

  it("should handle different gateway types", () => {
    const serviceName = "test-service";
    const port = 8080;
    const gateway = "public";
    const isAmbient = true;

    const result = getGatewayPolicyDescription(serviceName, port, gateway, isAmbient);
    expect(result).toBe("test-service-8080 Istio public gateway (ambient)");
  });
});

describe("networkPolicies", () => {
  const mockPkg: UDSPackage = {
    apiVersion: "uds.dev/v1",
    kind: "UDSPackage",
    metadata: {
      name: "test-pkg",
      namespace: "test-ns",
      generation: 1,
      uid: "test-uid",
    },
    spec: {
      network: {
        expose: [
          {
            service: "frontend",
            host: "frontend.example.com",
            selector: { app: "frontend" },
            port: 8080,
            gateway: Gateway.Tenant,
          },
          {
            service: "backend",
            host: "backend.example.com",
            selector: { app: "backend" },
            port: 8080, // Same port as frontend
            gateway: Gateway.Tenant,
          },
          {
            service: "api",
            host: "api.example.com",
            selector: { app: "api" },
            port: 3000,
            gateway: Gateway.Tenant,
          },
        ],
      },
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should generate network policies for multiple exposed services", async () => {
    const policies = await networkPolicies(mockPkg, "test-ns", "sidecar");

    // Verify we have the expected number of policies (default policies + exposed services)
    expect(policies.length).toBeGreaterThanOrEqual(3);

    // Define expected service policies
    const servicePolicies = [
      { name: "frontend", ports: [8080, 15008] },
      { name: "backend", ports: [8080, 15008] },
      { name: "api-3000", ports: [3000, 15008] },
    ];

    // Helper function to validate common policy properties
    const validatePolicy = (policy: V1NetworkPolicy, expectedPorts: number[]) => {
      // Verify namespace
      expect(policy.metadata?.namespace).toBe("test-ns");

      // Verify labels
      expect(policy.metadata?.labels).toMatchObject({
        "uds/package": "test-pkg",
        "uds/generation": "1",
      });

      // Verify owner references - only check kind and name as that's what's set in the implementation
      expect(policy.metadata?.ownerReferences).toContainEqual({
        kind: "UDSPackage",
        name: "test-pkg",
      });

      // Verify policy type is Ingress (if policyTypes is defined)
      if (policy.spec?.policyTypes) {
        expect(policy.spec.policyTypes).toContain("Ingress");
      }

      // Verify ingress rules exist and have the correct ports
      expect(policy.spec?.ingress).toBeDefined();
      const ports = policy.spec?.ingress?.[0]?.ports || [];
      expect(ports).toHaveLength(expectedPorts.length);
      expectedPorts.forEach(port => {
        expect(ports).toContainEqual({ port });
      });
    };

    // Verify service policies
    for (const { name, ports } of servicePolicies) {
      const matchingPolicies = policies.filter(p => p.metadata?.name?.includes(name));
      expect(matchingPolicies).toHaveLength(1);
      validatePolicy(matchingPolicies[0], ports);
    }

    // Verify default policies are included with package prefix
    const defaultPolicyNames = policies.map(p => p.metadata?.name);
    const expectedDefaultPolicies = [
      "deny-test-pkg-default-deny-all",
      "allow-test-pkg-allow-egress-dns",
      "allow-test-pkg-allow-egress-istiod",
    ];

    for (const policyName of expectedDefaultPolicies) {
      expect(defaultPolicyNames).toContain(policyName);
    }

    // Verify default deny all policy
    const defaultDenyPolicy = policies.find(
      p => p.metadata?.name === "deny-test-pkg-default-deny-all",
    );
    expect(defaultDenyPolicy).toBeDefined();
    // For default deny policy, either policyTypes should contain 'Ingress' or be undefined
    if (defaultDenyPolicy?.spec?.policyTypes) {
      expect(defaultDenyPolicy.spec.policyTypes).toContain("Ingress");
    }
    // The ingress array should be empty or undefined
    if (defaultDenyPolicy?.spec?.ingress) {
      expect(defaultDenyPolicy.spec.ingress).toEqual([]);
    }

    // Verify egress DNS policy
    const dnsPolicy = policies.find(p => p.metadata?.name === "allow-test-pkg-allow-egress-dns");
    expect(dnsPolicy).toBeDefined();
    if (dnsPolicy?.spec?.policyTypes) {
      expect(dnsPolicy.spec.policyTypes).toContain("Egress");
    }

    // Verify egress Istio policy
    const istioPolicy = policies.find(
      p => p.metadata?.name === "allow-test-pkg-allow-egress-istiod",
    );
    expect(istioPolicy).toBeDefined();
    if (istioPolicy?.spec?.policyTypes) {
      expect(istioPolicy.spec.policyTypes).toContain("Egress");
    }
  });
});
