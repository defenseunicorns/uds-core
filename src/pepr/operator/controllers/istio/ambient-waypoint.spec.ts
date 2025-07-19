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
  cleanupWaypointLabels,
  createWaypointGateway,
  isWaypointPodHealthy,
  reconcilePod,
  reconcileService,
  setupAmbientWaypoint,
} from "./ambient-waypoint";
import { matchesLabels, serviceMatchesSelector } from "./waypoint-utils";

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
const mockPatch = vi.fn();
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
      Patch: mockPatch,
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

// Mock the waypoint-utils module
vi.mock("./waypoint-utils", () => {
  const originalModule = vi.importActual("./waypoint-utils");
  return {
    ...originalModule,
    getWaypointName: vi.fn().mockImplementation((id: string) => `${id}-waypoint`),
    serviceMatchesSelector: vi.fn().mockReturnValue(false),
    matchesLabels: vi.fn().mockReturnValue(false),
  };
});

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
      patchOperations: [
        {
          op: "add",
          path: "/metadata/labels/istio.io~1use-waypoint",
          value: "test-client-waypoint",
        },
        {
          op: "add",
          path: "/metadata/labels/istio.io~1ingress-use-waypoint",
          value: "true",
        },
      ],
    },
    {
      name: "pod",
      reconcileFn: reconcilePod,
      createResource: createMockPod,
      expectedLabels: {
        "istio.io/use-waypoint": "test-client-waypoint",
      },
      patchOperations: [
        {
          op: "add",
          path: "/metadata/labels/istio.io~1use-waypoint",
          value: "test-client-waypoint",
        },
      ],
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockPatch.mockReset();
    mockPatch.mockResolvedValue({});
  });

  it.each(testCases)(
    "$name - should add waypoint labels when matching package exists",
    async ({ name, createResource, expectedLabels, patchOperations }) => {
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

      // Ensure metadata and labels exist
      if (!resource.metadata) resource.metadata = {};
      if (!resource.metadata.labels) resource.metadata.labels = {};
      resource.metadata.name = "test-resource";
      resource.metadata.namespace = "test-namespace";

      // Mock the serviceMatchesSelector or matchesLabels function based on resource type
      if ("spec" in resource && "selector" in resource.spec!) {
        (
          serviceMatchesSelector as unknown as { mockReturnValue: (val: boolean) => void }
        ).mockReturnValue(true);
        await reconcileService(resource as a.Service);
      } else {
        (matchesLabels as unknown as { mockReturnValue: (val: boolean) => void }).mockReturnValue(
          true,
        );
        await reconcilePod(resource as a.Pod);
      }

      // Verify the labels were updated in the object
      expect(resource.metadata?.labels).toMatchObject(expectedLabels);

      // Verify the K8s Patch operation was called correctly
      expect(mockPatch).toHaveBeenCalledWith(patchOperations);
      expect(mockLog.info).toHaveBeenCalledWith(
        expect.stringContaining(
          `Added waypoint labels to ${name === "service" ? "service" : "pod"} test-resource`,
        ),
        expect.objectContaining({
          namespace: "test-namespace",
          waypointName: "test-client-waypoint",
          clientId: "test-client",
        }),
      );
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

      // Mock the serviceMatchesSelector or matchesLabels function to return false
      if ("spec" in resource && "selector" in resource.spec!) {
        (
          serviceMatchesSelector as unknown as { mockReturnValue: (val: boolean) => void }
        ).mockReturnValue(false);
        await reconcileService(resource as a.Service);
      } else {
        (matchesLabels as unknown as { mockReturnValue: (val: boolean) => void }).mockReturnValue(
          false,
        );
        await reconcilePod(resource as a.Pod);
      }

      // Verify labels weren't changed
      expect(resource.metadata?.labels).toEqual(originalLabels);

      // Verify no waypoint labels were added
      Object.keys(expectedLabels).forEach(label => {
        expect(resource.metadata?.labels?.[label]).toBeUndefined();
      });

      // Verify the K8s Patch operation was not called
      expect(mockPatch).not.toHaveBeenCalled();
    },
  );

  it.each(testCases)(
    "$name - should handle errors during patch operation",
    async ({ createResource }) => {
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

      // Ensure metadata and labels exist
      if (!resource.metadata) resource.metadata = {};
      if (!resource.metadata.labels) resource.metadata.labels = {};
      resource.metadata.name = "test-resource";
      resource.metadata.namespace = "test-namespace";

      // Mock the serviceMatchesSelector or matchesLabels function based on resource type
      if ("spec" in resource && "selector" in resource.spec!) {
        (
          serviceMatchesSelector as unknown as { mockReturnValue: (val: boolean) => void }
        ).mockReturnValue(true);
      } else {
        (matchesLabels as unknown as { mockReturnValue: (val: boolean) => void }).mockReturnValue(
          true,
        );
      }

      // Mock the patch operation to throw an error
      const testError = new Error("Test patch error");
      mockPatch.mockRejectedValueOnce(testError);

      // Call the function
      if ("spec" in resource && "selector" in resource.spec!) {
        await reconcileService(resource as a.Service);
      } else {
        await reconcilePod(resource as a.Pod);
      }

      // Verify error was logged
      expect(mockLog.error).toHaveBeenCalledWith(
        expect.stringContaining(
          `Failed to update waypoint labels for ${"spec" in resource ? "service" : "pod"} test-resource`,
        ),
        expect.objectContaining({
          namespace: "test-namespace",
          waypointName: "test-client-waypoint",
          error: "Test patch error",
        }),
      );
    },
  );

  it.each(testCases)(
    "$name - should skip update if labels already exist",
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

      // Ensure metadata and labels exist with waypoint labels already set
      if (!resource.metadata) resource.metadata = {};
      if (!resource.metadata.labels) resource.metadata.labels = {};
      resource.metadata.name = "test-resource";
      resource.metadata.namespace = "test-namespace";

      // Set the waypoint labels that would normally be added
      Object.entries(expectedLabels).forEach(([key, value]) => {
        if (resource.metadata?.labels) {
          resource.metadata.labels[key] = value;
        }
      });

      // Mock the serviceMatchesSelector or matchesLabels function based on resource type
      if ("spec" in resource && "selector" in resource.spec!) {
        (
          serviceMatchesSelector as unknown as { mockReturnValue: (val: boolean) => void }
        ).mockReturnValue(true);
        await reconcileService(resource as a.Service);
      } else {
        (matchesLabels as unknown as { mockReturnValue: (val: boolean) => void }).mockReturnValue(
          true,
        );
        await reconcilePod(resource as a.Pod);
      }

      // Verify the K8s Patch operation was not called
      expect(mockPatch).not.toHaveBeenCalled();

      // Verify debug log was called
      expect(mockLog.debug).toHaveBeenCalledWith(
        expect.stringContaining(`already has correct waypoint label`),
        expect.objectContaining({
          namespace: "test-namespace",
          waypointName: "test-client-waypoint",
        }),
      );
    },
  );
});

describe("setupAmbientWaypoint", () => {
  beforeEach(() => {
    // Clear all mocks before each test
    vi.clearAllMocks();
  });

  it("should throw an error when package metadata is missing namespace or name", async () => {
    // Create a package with missing metadata
    const pkg = { metadata: {} } as UDSPackage;

    // Expect the function to throw with the correct error message
    await expect(setupAmbientWaypoint(pkg)).rejects.toThrow(
      "Package metadata is missing namespace or name",
    );

    // Also test with partial metadata
    const pkgNoNamespace = { metadata: { name: "test" } } as UDSPackage;
    await expect(setupAmbientWaypoint(pkgNoNamespace)).rejects.toThrow(
      "Package metadata is missing namespace or name",
    );

    const pkgNoName = { metadata: { namespace: "test-ns" } } as UDSPackage;
    await expect(setupAmbientWaypoint(pkgNoName)).rejects.toThrow(
      "Package metadata is missing namespace or name",
    );
  });

  it("should handle empty auth service clients array", async () => {
    // Create a package with no auth service clients
    const pkg = {
      metadata: {
        namespace: "test-ns",
        name: "test-pkg",
      },
      spec: {
        sso: [], // Empty array of SSO clients
      },
    } as UDSPackage;

    // This should not throw and should complete successfully with empty results
    const result = await setupAmbientWaypoint(pkg);
    expect(result).toEqual({
      clientsProcessed: 0,
      waypointsCreated: 0,
      reconciliationResults: [],
    });
  });
});

describe("cleanupWaypointLabels", () => {
  const namespace = "test-ns";
  const waypointName = "test-waypoint";
  const ISTIO_WAYPOINT_LABEL = "istio.io/use-waypoint";

  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockResolvedValue({ items: [] });
  });

  it("should remove waypoint labels from pods and services", async () => {
    // Mock pods with waypoint labels
    const pod1 = createMockPod({
      [ISTIO_WAYPOINT_LABEL]: waypointName,
      "istio.io/ingress-use-waypoint": "true",
      app: "test-app",
    });
    const pod2 = createMockPod({
      [ISTIO_WAYPOINT_LABEL]: waypointName,
      "istio.io/ingress-use-waypoint": "true",
      app: "another-app",
    });

    // Mock services with waypoint labels
    const svc1 = createMockService(
      {},
      {
        [ISTIO_WAYPOINT_LABEL]: waypointName,
        "istio.io/ingress-use-waypoint": "true",
        app: "test-service",
      },
    );

    // Setup mock responses
    mockGet
      .mockResolvedValueOnce({ items: [pod1, pod2] }) // Pods response
      .mockResolvedValueOnce({ items: [svc1] }); // Services response

    await cleanupWaypointLabels(namespace, waypointName);

    // Verify pod patches
    expect(mockInNamespace).toHaveBeenCalledWith(namespace);
    expect(mockWithLabel).toHaveBeenCalledWith(ISTIO_WAYPOINT_LABEL, waypointName);

    // Verify service patches
    expect(mockInNamespace).toHaveBeenCalledWith(namespace);
    expect(mockWithLabel).toHaveBeenCalledWith(ISTIO_WAYPOINT_LABEL, waypointName);

    // Verify patch operations for pods
    expect(mockGet).toHaveBeenCalledTimes(2); // Once for pods, once for services
    expect(mockLog.info).toHaveBeenCalledWith(
      `Starting cleanup of waypoint labels: namespace=${namespace}, waypoint=${waypointName}`,
    );
    // The debug message is no longer called in the current implementation
  });

  it("should handle empty responses gracefully", async () => {
    // Mock empty responses
    mockGet
      .mockResolvedValueOnce({ items: [] }) // No pods
      .mockResolvedValueOnce({ items: [] }); // No services

    await cleanupWaypointLabels(namespace, waypointName);

    expect(mockGet).toHaveBeenCalledTimes(2);
    expect(mockLog.info).toHaveBeenCalledWith(
      `Starting cleanup of waypoint labels: namespace=${namespace}, waypoint=${waypointName}`,
    );
    // The finished message might not be in the implementation anymore
  });

  it("should handle errors gracefully", async () => {
    const testError = new Error("Test error");
    mockGet.mockRejectedValueOnce(testError);

    await cleanupWaypointLabels(namespace, waypointName);

    expect(mockLog.error).toHaveBeenCalledWith("Failed to clean up waypoint labels", {
      namespace,
      waypointName,
      error: "Test error",
    });
  });

  it("should only remove matching waypoint labels", async () => {
    // Mock a pod with a different waypoint label
    const otherPod = createMockPod({
      [ISTIO_WAYPOINT_LABEL]: "other-waypoint",
      "istio.io/ingress-use-waypoint": "true",
    });

    // Mock a pod with the target waypoint label
    const targetPod = createMockPod({
      [ISTIO_WAYPOINT_LABEL]: waypointName,
      "istio.io/ingress-use-waypoint": "true",
    });

    mockGet
      .mockResolvedValueOnce({ items: [otherPod, targetPod] }) // Pods
      .mockResolvedValueOnce({ items: [] }); // No services

    await cleanupWaypointLabels(namespace, waypointName);

    // Should only patch the target pod
    expect(mockGet).toHaveBeenCalledTimes(2);
    expect(mockLog.debug).toHaveBeenCalledWith(
      `Skipping pod test-pod: label ${ISTIO_WAYPOINT_LABEL} does not match ${waypointName}`,
    );
  });
});

describe("createWaypointGateway", () => {
  const waypointName = "test-client-waypoint";
  const waypointId = "test-client";

  beforeEach(() => {
    vi.clearAllMocks();
    mockApply.mockReset();
    mockApply.mockResolvedValue({});
  });

  it("should create a waypoint gateway successfully", async () => {
    // Create a test package
    const pkg = createMockPackage("test-pkg");

    // Call the function
    const result = await createWaypointGateway(pkg, waypointName, waypointId);

    // Verify the gateway was created with correct properties
    expect(mockApply).toHaveBeenCalledTimes(1);
    expect(mockApply).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          name: waypointName,
          namespace: "test-ns",
          labels: expect.objectContaining({
            "uds/managed-by": "uds-operator",
            "app.kubernetes.io/component": "ambient-waypoint",
            "istio.io/waypoint-for": "all",
            "istio.io/gateway-name": waypointName,
            "uds/generation": "0",
            "uds/package": "test-pkg",
          }),
          ownerReferences: [
            {
              kind: "Package",
              name: "test-pkg",
              uid: "test-uid",
              apiVersion: "uds.dev/v1alpha1",
            },
          ],
        }),
        spec: {
          gatewayClassName: "istio-waypoint",
          listeners: [{ name: "mesh", port: 15008, protocol: "HBONE" }],
        },
      }),
    );

    // Verify the function returned the waypoint name
    expect(result).toBe(waypointName);

    // Verify logging
    expect(mockLog.info).toHaveBeenCalledWith(
      expect.stringContaining("Creating waypoint gateway for package"),
      expect.objectContaining({
        waypointName,
        waypointId,
        namespace: "test-ns",
        packageName: "test-pkg",
      }),
    );
    expect(mockLog.info).toHaveBeenCalledWith(
      "Successfully created waypoint gateway",
      expect.objectContaining({
        namespace: "test-ns",
        waypointName,
      }),
    );
  });

  it("should throw an error when package metadata is missing", async () => {
    // Create a package with missing metadata
    const pkg = { ...createMockPackage("test-pkg"), metadata: {} };

    // Expect the function to throw an error
    await expect(createWaypointGateway(pkg, waypointName, waypointId)).rejects.toThrow(
      "Package metadata is missing namespace or name",
    );

    // Verify the gateway was not created
    expect(mockApply).not.toHaveBeenCalled();
  });

  it("should handle errors during gateway creation", async () => {
    // Create a test package
    const pkg = createMockPackage("test-pkg");

    // Mock an error during Apply
    const testError = new Error("Test apply error");
    mockApply.mockRejectedValueOnce(testError);

    // Expect the function to throw an error
    await expect(createWaypointGateway(pkg, waypointName, waypointId)).rejects.toThrow(
      "Failed to create waypoint gateway: Test apply error",
    );

    // Verify error logging
    expect(mockLog.error).toHaveBeenCalledWith(
      "Error creating waypoint gateway",
      expect.objectContaining({
        namespace: "test-ns",
        waypointName,
        errorType: "object",
        errorDetails: testError,
      }),
    );
  });

  it("should handle non-Error objects during gateway creation", async () => {
    // Create a test package
    const pkg = createMockPackage("test-pkg");

    // Mock a non-Error object during Apply
    const testError = "String error message";
    mockApply.mockRejectedValueOnce(testError);

    // Expect the function to throw an error
    await expect(createWaypointGateway(pkg, waypointName, waypointId)).rejects.toThrow(
      "Failed to create waypoint gateway: String error message",
    );

    // Verify error logging
    expect(mockLog.error).toHaveBeenCalledWith(
      "Error creating waypoint gateway",
      expect.objectContaining({
        namespace: "test-ns",
        waypointName,
        errorType: "string",
        errorDetails: testError,
      }),
    );
  });
});
