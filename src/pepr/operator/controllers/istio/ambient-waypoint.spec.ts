/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { V1NetworkPolicySpec } from "@kubernetes/client-node";
import { describe, expect, it, vi } from "vitest";

// Mock the K8s client methods
const mockApply = vi.fn();
const mockDelete = vi.fn();
const mockGet = vi.fn();
const mockInNamespace = vi.fn();
const mockWithLabel = vi.fn();

// Mock the K8s client
vi.mock("pepr", async () => {
  const actual = await vi.importActual<typeof import("pepr")>("pepr");
  return {
    ...actual,
    K8s: vi.fn().mockImplementation(() => ({
      InNamespace: mockInNamespace.mockReturnThis(),
      WithLabel: mockWithLabel.mockReturnThis(),
      Get: mockGet,
      Apply: mockApply,
      Delete: mockDelete,
    })),
  };
});

// Mock the PackageStore
vi.mock("../packages/package-store", () => ({
  PackageStore: {
    getAmbientPackagesByNamespace: vi.fn().mockReturnValue([]),
    addPackage: vi.fn(),
    removePackage: vi.fn(),
  },
}));

// Mock the utils module
vi.mock("../utils", () => ({
  getOwnerRef: vi.fn().mockReturnValue([
    {
      kind: "Package",
      name: "test-pkg",
      uid: "test-uid",
      apiVersion: "uds.dev/v1alpha1",
    },
  ]),
}));

// Import the actual module to spy on its methods
import { UDSPackage } from "../../crd";
import {
  createNetworkPolicy,
  getPodSelector,
  getWaypointName,
  hasAuthserviceSSO,
  shouldUseAmbientWaypoint,
} from "./ambient-waypoint";

// Mock the istio-resources module
vi.mock("./istio-resources", () => ({
  log: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn().mockReturnThis(),
  },
}));

// Get the mocked log object
// const mockLog = (istioResources as typeof import("./istio-resources")).log;

describe("hasAuthserviceSSO", () => {
  it("should return true when package has SSO with enableAuthserviceSelector", () => {
    const pkg = {
      metadata: { name: "test", namespace: "test" },
      spec: {
        sso: [
          {
            clientId: "test-client",
            name: "test-sso",
            enableAuthserviceSelector: {
              "app.kubernetes.io/name": "test-app",
            },
          },
        ],
      },
    } as UDSPackage;

    expect(hasAuthserviceSSO(pkg)).toBe(true);
  });

  it("should return false when package has no SSO configuration", () => {
    const pkg = {
      metadata: { name: "test", namespace: "test" },
      spec: { sso: [] },
    } as UDSPackage;

    expect(hasAuthserviceSSO(pkg)).toBe(false);
  });

  it("should return false when package has SSO without enableAuthserviceSelector", () => {
    const pkg = {
      metadata: { name: "test", namespace: "test" },
      spec: {
        sso: [
          {
            clientId: "test-client",
            name: "test-sso",
          },
        ],
      },
    } as UDSPackage;

    expect(hasAuthserviceSSO(pkg)).toBe(false);
  });

  it("should return false when package spec is undefined", () => {
    const pkg = {
      metadata: { name: "test", namespace: "test" },
    } as UDSPackage;

    expect(hasAuthserviceSSO(pkg)).toBe(false);
  });

  it("should return false when package is undefined", () => {
    expect(hasAuthserviceSSO(undefined as unknown as UDSPackage)).toBe(false);
  });
});

describe("shouldUseAmbientWaypoint", () => {
  it("should return true when in ambient mode with SSO", () => {
    const pkg = {
      metadata: { name: "test", namespace: "test" },
      spec: {
        network: { serviceMesh: { mode: "ambient" } },
        sso: [
          {
            clientId: "test-client",
            name: "test-sso",
            enableAuthserviceSelector: { "app.kubernetes.io/name": "test-app" },
          },
        ],
      },
    } as UDSPackage;

    expect(shouldUseAmbientWaypoint(pkg)).toBe(true);
  });

  it("should return false when not in ambient mode", () => {
    const pkg = {
      metadata: { name: "test", namespace: "test" },
      spec: {
        network: { serviceMesh: { mode: "sidecar" } },
        sso: [
          {
            clientId: "test-client",
            name: "test-sso",
            enableAuthserviceSelector: { "app.kubernetes.io/name": "test-app" },
          },
        ],
      },
    } as UDSPackage;

    expect(shouldUseAmbientWaypoint(pkg)).toBe(false);
  });

  it("should return false when no serviceMesh config exists", () => {
    const pkg = {
      metadata: { name: "test", namespace: "test" },
      spec: {
        sso: [
          {
            clientId: "test-client",
            name: "test-sso",
            enableAuthserviceSelector: { "app.kubernetes.io/name": "test-app" },
          },
        ],
      },
    } as UDSPackage;

    expect(shouldUseAmbientWaypoint(pkg)).toBe(false);
  });

  it("should return false when package is undefined", () => {
    expect(shouldUseAmbientWaypoint(undefined as unknown as UDSPackage)).toBe(false);
  });
});

describe("getWaypointName", () => {
  it("should add uds-core prefix when not present", () => {
    expect(getWaypointName("test")).toBe("uds-core-test-waypoint");
  });

  it("should not add uds-core prefix when already present", () => {
    expect(getWaypointName("uds-core-test")).toBe("uds-core-test-waypoint");
  });

  it("should handle empty string", () => {
    expect(getWaypointName("")).toBe("uds-core--waypoint");
  });
});

describe("getPodSelector", () => {
  it("should return waypoint selector in ambient mode", () => {
    const pkg = {
      metadata: { name: "test", namespace: "test" },
      spec: {
        network: { serviceMesh: { mode: "ambient" } },
        sso: [
          {
            clientId: "test-client",
            name: "test-sso",
            enableAuthserviceSelector: { "app.kubernetes.io/name": "test-app" },
          },
        ],
      },
    } as UDSPackage;

    const selector = { app: "test" };
    const waypointName = "test-waypoint";
    const result = getPodSelector(pkg, selector, waypointName);

    expect(result).toEqual({ "istio.io/gateway-name": waypointName });
  });

  it("should return original selector in non-ambient mode", () => {
    const pkg = {
      metadata: { name: "test", namespace: "test" },
      spec: {
        network: { serviceMesh: { mode: "sidecar" } },
        sso: [
          {
            clientId: "test-client",
            name: "test-sso",
            enableAuthserviceSelector: { "app.kubernetes.io/name": "test-app" },
          },
        ],
      },
    } as UDSPackage;

    const selector = { app: "test" };
    const waypointName = "test-waypoint";
    const result = getPodSelector(pkg, selector, waypointName);

    expect(result).toBe(selector);
  });

  it("should handle undefined package", () => {
    const selector = { app: "test" };
    const waypointName = "test-waypoint";
    const result = getPodSelector(undefined as unknown as UDSPackage, selector, waypointName);

    expect(result).toBe(selector);
  });
});

describe("createNetworkPolicy", () => {
  it("should create a network policy with the correct structure", () => {
    const pkg = {
      metadata: {
        name: "test-pkg",
        namespace: "test-ns",
        uid: "test-uid",
      },
    } as UDSPackage;

    const spec = {
      podSelector: { matchLabels: { app: "test" } },
      policyTypes: ["Ingress"],
    } as V1NetworkPolicySpec;

    const policy = createNetworkPolicy("test-policy", "test-ns", pkg, spec);

    expect(policy).toEqual({
      apiVersion: "networking.k8s.io/v1",
      kind: "NetworkPolicy",
      metadata: {
        name: "test-policy",
        namespace: "test-ns",
        labels: { "uds/managed-by": "uds-operator" },
        ownerReferences: [
          {
            apiVersion: "uds.dev/v1alpha1",
            kind: "Package",
            name: "test-pkg",
            uid: "test-uid",
          },
        ],
      },
      spec: {
        podSelector: { matchLabels: { app: "test" } },
        policyTypes: ["Ingress"],
      },
    });
  });

  it("should include all provided spec fields", () => {
    const pkg = {
      metadata: { name: "test", namespace: "test", uid: "test" },
    } as UDSPackage;

    const spec = {
      podSelector: { matchLabels: { app: "test" } },
      policyTypes: ["Ingress", "Egress"],
      egress: [{}],
      ingress: [{}],
    } as V1NetworkPolicySpec;

    const policy = createNetworkPolicy("test", "test", pkg, spec);
    expect(policy.spec).toEqual(spec);
  });
});
