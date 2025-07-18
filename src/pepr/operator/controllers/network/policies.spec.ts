/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { describe, expect, it, vi } from "vitest";
import { Direction, UDSPackage } from "../../crd";
import { findMatchingClient, getGatewayPolicyDescription } from "./policies";

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
  it("should return ambient description when isAmbient is true and clientId is provided", () => {
    const port = 8080;
    const clientId = "test-client";
    const gateway = "tenant";
    const isAmbient = true;

    const result = getGatewayPolicyDescription(port, clientId, gateway, isAmbient);
    expect(result).toBe("8080-test-client Istio tenant gateway (ambient)");
  });

  it("should return standard description when isAmbient is false", () => {
    const port = 8080;
    const clientId = "test-client";
    const gateway = "tenant";
    const isAmbient = false;

    const result = getGatewayPolicyDescription(port, clientId, gateway, isAmbient);
    expect(result).toBe("8080-service Istio tenant gateway");
  });

  it("should return standard description when clientId is undefined", () => {
    const port = 8080;
    const clientId = undefined;
    const gateway = "tenant";
    const isAmbient = true;

    const result = getGatewayPolicyDescription(port, clientId, gateway, isAmbient);
    expect(result).toBe("8080-service Istio tenant gateway");
  });

  it("should handle different gateway types", () => {
    const port = 8080;
    const clientId = "test-client";
    const gateway = "public";
    const isAmbient = true;

    const result = getGatewayPolicyDescription(port, clientId, gateway, isAmbient);
    expect(result).toBe("8080-test-client Istio public gateway (ambient)");
  });
});
