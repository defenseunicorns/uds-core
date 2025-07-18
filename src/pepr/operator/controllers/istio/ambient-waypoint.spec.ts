/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { a } from "pepr";
import { beforeEach, describe, expect, it, vi, type MockedFunction } from "vitest";
import { UDSPackage } from "../../crd";
import { Mode, Sso } from "../../crd/generated/package-v1alpha1";
import { PackageStore } from "../packages/package-store";
import {
  generateWaypointNetworkPolicies,
  isWaypointPodHealthy,
  reconcilePod,
  reconcileService,
  setupAmbientWaypoint,
} from "./ambient-waypoint";

// Test helpers
const createMockPackage = (
  name: string,
  selector: Record<string, string> = {},
  mode: "ambient" | "sidecar" = "ambient",
  sso: Sso[] = [
    {
      clientId: "test-client",
      name: "test-sso",
      enableAuthserviceSelector: selector,
    },
  ],
): UDSPackage => ({
  metadata: {
    name,
    namespace: "test-ns",
    uid: "test-uid",
  },
  spec: {
    network: {
      serviceMesh: {
        mode: mode === "ambient" ? Mode.Ambient : Mode.Sidecar,
      },
    },
    sso,
  },
});

const createMockService = (
  selector: Record<string, string> = {},
  labels: Record<string, string> = {},
): a.Service => ({
  metadata: {
    name: "test-svc",
    namespace: "test-ns",
    labels: { ...labels },
  },
  spec: { selector: { ...selector } },
});

const createMockPod = (labels: Record<string, string> = {}): a.Pod => ({
  metadata: {
    name: "test-pod",
    namespace: "test-ns",
    labels: { ...labels },
  },
});

// Mock the K8s client methods
const mockApply = vi.fn();
const mockCreate = vi.fn();
const mockDelete = vi.fn();
const mockGet = vi.fn();
const mockInNamespace = vi.fn().mockReturnThis();
const mockWithLabel = vi.fn().mockReturnThis();

// Mock the K8s client
vi.mock("pepr", async () => {
  const actual = await vi.importActual<typeof import("pepr")>("pepr");
  return {
    ...actual,
    K8s: vi.fn().mockImplementation(() => ({
      InNamespace: mockInNamespace,
      WithLabel: mockWithLabel,
      Get: mockGet,
      Apply: mockApply,
      Create: mockCreate,
      Delete: mockDelete,
    })),
  };
});

// Mock the PackageStore
vi.mock("../packages/package-store", () => ({
  PackageStore: {
    getPackageByNamespace: vi.fn().mockImplementation(namespace => {
      // Return the test package when the namespace matches
      if (namespace === "test-ns") {
        return createMockPackage("test-pkg", { "app.kubernetes.io/name": "test-app" }, "ambient", [
          {
            clientId: "test-client",
            name: "test-sso",
            enableAuthserviceSelector: { "app.kubernetes.io/name": "test-app" },
          },
        ]);
      }
      return undefined;
    }),
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

// Create a mock for the log functions
const mockLog = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  child: vi.fn().mockReturnThis(),
}));

// Mock the istio-resources module
vi.mock("./istio-resources.js", () => ({
  log: mockLog,
}));

describe("isWaypointPodHealthy", () => {
  const namespace = "test-ns";
  const waypointName = "test-waypoint";

  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockResolvedValue({ items: [] });
  });

  const testCases = [
    {
      name: "should return true when a healthy pod exists",
      podStatus: {
        phase: "Running",
        containerStatuses: [
          { name: "container-1", ready: true },
          { name: "container-2", ready: true },
        ],
      },
      expected: true,
    },
    {
      name: "should return false when no pods exist",
      podStatus: { items: [] },
      expected: false,
    },
    {
      name: "should return false when pod is not running",
      podStatus: {
        items: [
          {
            status: {
              phase: "Pending",
              containerStatuses: [{ name: "container-1", ready: true }],
            },
          },
        ],
      },
      expected: false,
    },
  ];

  it.each(testCases)("$name", async ({ podStatus, expected }) => {
    mockGet.mockResolvedValueOnce(
      Array.isArray(podStatus)
        ? { items: podStatus }
        : {
            items: [{ metadata: { name: "test-pod" }, status: podStatus }],
          },
    );

    const result = await isWaypointPodHealthy(namespace, waypointName);
    expect(result).toBe(expected);
    expect(mockInNamespace).toHaveBeenCalledWith(namespace);
    expect(mockWithLabel).toHaveBeenCalledWith(`istio.io/gateway-name=${waypointName}`);
  });
});

describe("reconcileService and reconcilePod", () => {
  const testCases = [
    {
      name: "service",
      reconcileFn: reconcileService,
      createResource: createMockService,
      expectedLabels: {
        "istio.io/use-waypoint": "test-client-waypoint",
        "istio.io/ingress-use-waypoint": "true",
      },
    },
    {
      name: "pod",
      reconcileFn: reconcilePod,
      createResource: createMockPod,
      expectedLabels: {
        "istio.io/use-waypoint": "test-client-waypoint",
      },
    },
  ];

  it.each(testCases)(
    "$name - should add waypoint labels when matching package exists",
    async ({ createResource, expectedLabels }) => {
      const resource = createResource({ "app.kubernetes.io/name": "test-app" });
      const pkg = createMockPackage(
        "test-pkg",
        { "app.kubernetes.io/name": "test-app" },
        "ambient",
        [
          {
            clientId: "test-client",
            name: "test-sso",
            enableAuthserviceSelector: { "app.kubernetes.io/name": "test-app" },
          },
        ],
      );
      (
        PackageStore.getPackageByNamespace as MockedFunction<
          typeof PackageStore.getPackageByNamespace
        >
      ).mockReturnValue(pkg);

      // Cast to the appropriate type based on the resource
      if ("spec" in resource && "selector" in resource.spec!) {
        await reconcileService(resource as a.Service);
      } else {
        await reconcilePod(resource as a.Pod);
      }

      expect(resource.metadata?.labels).toMatchObject(expectedLabels);
    },
  );

  it.each(testCases)(
    "$name - should not modify when no matching package",
    async ({ createResource, expectedLabels }) => {
      const resource = createResource({ "app.kubernetes.io/name": "test-app" });
      const pkg = createMockPackage(
        "test-pkg",
        { "app.kubernetes.io/name": "no-match" },
        "ambient",
        [
          {
            clientId: "test-client",
            name: "test-sso",
            enableAuthserviceSelector: { "app.kubernetes.io/name": "no-match" },
          },
        ],
      );
      (
        PackageStore.getPackageByNamespace as MockedFunction<
          typeof PackageStore.getPackageByNamespace
        >
      ).mockReturnValue(pkg);

      // Save the original state
      const originalLabels = { ...(resource.metadata?.labels || {}) };

      // Cast to the appropriate type based on the resource
      if ("spec" in resource && "selector" in resource.spec!) {
        await reconcileService(resource as a.Service);
      } else {
        await reconcilePod(resource as a.Pod);
      }

      // For service, we should have the original labels (empty or with app.kubernetes.io/name)
      // For pod, we should have the original labels
      expect(resource.metadata?.labels).toEqual(originalLabels);

      // Verify no waypoint labels were added
      Object.keys(expectedLabels).forEach(label => {
        expect(resource.metadata?.labels?.[label]).toBeUndefined();
      });
    },
  );
});

describe("setupAmbientWaypoint", () => {
  const waypointId = "test-client";
  const expectedWaypointName = "test-client-waypoint"; // This matches getWaypointName(waypointId)

  const pkg = createMockPackage("test-pkg", { "app.kubernetes.io/name": "test-app" }, "ambient", [
    {
      clientId: "test-client", // This will be transformed to test-client-waypoint
      name: "test-sso",
      enableAuthserviceSelector: { "app.kubernetes.io/name": "test-app" },
    },
  ]);

  beforeEach(async () => {
    vi.clearAllMocks();

    // Mock the Get method to simulate pod readiness
    mockGet.mockResolvedValue({
      items: [
        {
          metadata: { name: "test-pod" },
          status: {
            phase: "Running",
            containerStatuses: [
              { name: "istio-proxy", ready: true },
              { name: "istio-validation", ready: true },
            ],
          },
        },
      ],
    });

    // Mock the createWaypointGateway function directly
    mockCreate.mockResolvedValue({
      metadata: {
        name: expectedWaypointName, // Use the expected waypoint name
        namespace: "test-ns",
      },
    });
  });

  it("should create a waypoint gateway and network policies", async () => {
    // Mock the Get method to first return undefined (gateway doesn't exist)
    mockGet.mockImplementation(name => {
      if (name === expectedWaypointName) {
        // Use the expected waypoint name
        // Simulate gateway not existing to force creation
        throw new Error("Gateway not found");
      }
      // Return mock pod list for the waitForWaypointPodHealthy function
      return Promise.resolve({
        items: [
          {
            metadata: { name: "test-pod" },
            status: {
              phase: "Running",
              containerStatuses: [
                { name: "istio-proxy", ready: true },
                { name: "istio-validation", ready: true },
              ],
            },
          },
        ],
      });
    });

    await setupAmbientWaypoint(pkg, waypointId);

    // Verify the gateway was created
    expect(mockCreate).toHaveBeenCalled();
    const gatewayArg = mockCreate.mock.calls[0]?.[0];

    expect(gatewayArg).toMatchObject({
      metadata: {
        name: expectedWaypointName,
        namespace: "test-ns",
        labels: {
          "uds/managed-by": "uds-operator",
          "app.kubernetes.io/component": "ambient-waypoint",
          "istio.io/waypoint-for": "all",
          "istio.io/gateway-name": expectedWaypointName,
        },
      },
      spec: {
        gatewayClassName: "istio-waypoint",
      },
    });

    // Verify network policies were created
    const networkPolicyCalls = mockApply.mock.calls.filter(
      call => call[0]?.kind === "NetworkPolicy",
    );
    expect(networkPolicyCalls).toHaveLength(3);
  });
});

describe("generateWaypointNetworkPolicies", () => {
  const pkg = createMockPackage("test-pkg", { "app.kubernetes.io/name": "test-app" }, "ambient", [
    {
      clientId: "test-client",
      name: "test-sso",
      enableAuthserviceSelector: { "app.kubernetes.io/name": "test-app" },
    },
  ]);
  const waypointName = "test-waypoint";
  const appSelector = { "app.kubernetes.io/name": "test-app" };

  beforeEach(() => {
    vi.clearAllMocks();
    mockApply.mockResolvedValue({});
  });

  it("should create ingress and egress network policies", async () => {
    await generateWaypointNetworkPolicies(pkg, waypointName, appSelector);

    const policies = mockApply.mock.calls.map(call => call[0]);
    const ingressPolicy = policies.find(p => p.metadata.name.includes("ingress"));
    const egressPolicy = policies.find(p => p.metadata.name.includes("egress"));

    expect(ingressPolicy).toMatchObject({
      spec: {
        podSelector: { matchLabels: { "istio.io/gateway-name": waypointName } },
        policyTypes: ["Ingress"],
      },
    });

    expect(egressPolicy).toMatchObject({
      spec: {
        podSelector: { matchLabels: { "istio.io/gateway-name": waypointName } },
        policyTypes: ["Egress"],
      },
    });
  });
});
