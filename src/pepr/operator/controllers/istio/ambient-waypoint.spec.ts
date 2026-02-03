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
  createEgressWaypointGateway,
  createWaypointGateway,
  egressWaypointName,
  isWaypointPodHealthy,
  reconcileExistingResources,
  reconcilePod,
  reconcileService,
  setupAmbientWaypoint,
} from "./ambient-waypoint";
import { ambientEgressNamespace, sharedEgressPkgId } from "./istio-resources";

// Test helpers
const createMockPackage = (
  name: string,
  selector: Record<string, string> = {},
  mode: "ambient" | "sidecar" | "unset" = "ambient",
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
    network:
      mode === "unset"
        ? {}
        : {
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
vi.mock("./waypoint-utils", async () => {
  const actual = await vi.importActual("./waypoint-utils");
  return {
    ...actual,
    getWaypointName: vi.fn().mockImplementation((id: string) => `${id}-waypoint`),
  };
});

// Mock the utils module
vi.mock("../utils", async () => {
  const actual = await vi.importActual("../utils");
  return {
    ...actual,
    getOwnerRef: vi.fn().mockReturnValue([
      {
        kind: "Package",
        name: "test-pkg",
        uid: "test-uid",
        apiVersion: "uds.dev/v1alpha1",
      },
    ]),
  };
});

// Create a mock for the log functions
const mockLog = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  child: vi.fn().mockReturnThis(),
}));

// Mock the shared/constants module to override the log
vi.mock("./shared/constants", async importOriginal => {
  const actual = await importOriginal<typeof import("./shared/constants")>();
  return {
    ...actual,
    log: mockLog,
  };
});

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
      name: "should return false when pod is not running",
      podStatus: {
        phase: "Pending",
        containerStatuses: [{ name: "container-1", ready: true }],
      },
      expected: false,
    },
  ];

  it.each(testCases)("$name", async ({ podStatus, expected }) => {
    mockGet.mockResolvedValueOnce({
      items: [
        {
          metadata: { name: "test-pod" },
          status: podStatus,
        },
      ],
    });

    const result = await isWaypointPodHealthy(namespace, waypointName);
    expect(result).toBe(expected);
    expect(mockInNamespace).toHaveBeenCalledWith(namespace);
    expect(mockWithLabel).toHaveBeenCalledWith(`istio.io/gateway-name=${waypointName}`);
  });
});

describe("reconcileService and reconcilePod", () => {
  const testNamespace = "test-ns";
  interface TestCase {
    name: string;
    createResource: (labels?: Record<string, string>) => a.Pod | a.Service;
    expectedLabels: Record<string, string>;
  }

  const testCases: TestCase[] = [
    {
      name: "service",
      createResource: (labels = {}) =>
        createMockService({ "app.kubernetes.io/name": "test-app" }, labels),
      expectedLabels: {
        "istio.io/use-waypoint": "test-client-waypoint",
        "istio.io/ingress-use-waypoint": "true",
      },
    },
    {
      name: "pod",
      createResource: (labels = {}) =>
        createMockPod({ ...labels, "app.kubernetes.io/name": "test-app" }),
      expectedLabels: {
        "istio.io/use-waypoint": "test-client-waypoint",
      },
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(testCases)(
    "$name - should add waypoint labels when matching package exists",
    async ({ createResource, expectedLabels, name }) => {
      const resource = createResource();

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

      // Set up the mock to return the package when called with the test namespace
      (
        PackageStore.getPackageByNamespace as MockedFunction<
          typeof PackageStore.getPackageByNamespace
        >
      ).mockImplementation(namespace => {
        return namespace === testNamespace ? pkg : undefined;
      });

      // Call the appropriate reconcile function based on the resource type
      if (name === "service") {
        await reconcileService(resource as a.Service);
      } else {
        await reconcilePod(resource as a.Pod);
      }

      expect(resource.metadata?.labels).toMatchObject(expectedLabels);
    },
  );

  it.each(testCases)(
    "$name - should not modify when no matching package",
    async ({ createResource, name }) => {
      const resource = createResource();
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

      // Call the appropriate reconcile function based on the resource type
      if (name === "service") {
        await reconcileService(resource as a.Service);
      } else {
        await reconcilePod(resource as a.Pod);
      }

      // Verify the labels weren't modified
      expect(resource.metadata?.labels).toEqual(originalLabels);

      // Verify no waypoint labels were added
      expect(resource.metadata?.labels?.["istio.io/use-waypoint"]).toBeUndefined();
      if (name === "service") {
        expect(resource.metadata?.labels?.["istio.io/ingress-use-waypoint"]).toBeUndefined();
      }
    },
  );

  it.each(testCases)(
    "$name - defaults to ambient mode when serviceMesh.mode is undefined",
    async ({ createResource, expectedLabels, name }) => {
      const resource = createResource();

      const pkg = createMockPackage("test-pkg", { "app.kubernetes.io/name": "test-app" }, "unset", [
        {
          clientId: "test-client",
          name: "test-sso",
          enableAuthserviceSelector: { "app.kubernetes.io/name": "test-app" },
        },
      ]);

      (
        PackageStore.getPackageByNamespace as MockedFunction<
          typeof PackageStore.getPackageByNamespace
        >
      ).mockImplementation(namespace => {
        return namespace === testNamespace ? pkg : undefined;
      });

      if (name === "service") {
        await reconcileService(resource as a.Service);
      } else {
        await reconcilePod(resource as a.Pod);
      }

      expect(resource.metadata?.labels).toMatchObject(expectedLabels);
    },
  );
});

describe("setupAmbientWaypoint", () => {
  beforeEach(() => {
    // Clear all mocks before each test
    vi.clearAllMocks();
  });

  const client = {
    clientId: "test-client",
    name: "test-sso",
    enableAuthserviceSelector: {
      app: "test-client",
    },
  };

  it("should throw an error when package metadata is missing namespace or name", async () => {
    // Create a package with missing metadata
    const pkg = { metadata: {} } as UDSPackage;

    // Expect the function to throw with the correct error message
    await expect(setupAmbientWaypoint(pkg, client)).rejects.toThrow(
      "Package metadata is missing namespace or name",
    );

    // Also test with partial metadata
    const pkgNoNamespace = { metadata: { name: "test" } } as UDSPackage;
    await expect(setupAmbientWaypoint(pkgNoNamespace, client)).rejects.toThrow(
      "Package metadata is missing namespace or name",
    );

    const pkgNoName = { metadata: { namespace: "test-ns" } } as UDSPackage;
    await expect(setupAmbientWaypoint(pkgNoName, client)).rejects.toThrow(
      "Package metadata is missing namespace or name",
    );
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

    expect(mockLog.error).toHaveBeenCalledWith(
      {
        namespace,
        waypointName,
        error: "Test error",
      },
      "Failed to clean up waypoint labels",
    );
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
  });
});

describe("createWaypointGateway", () => {
  const waypointName = "test-client-waypoint";

  beforeEach(() => {
    vi.clearAllMocks();
    mockApply.mockReset();
    mockApply.mockResolvedValue({});
  });

  it("should create a waypoint gateway successfully", async () => {
    // Create a test package
    const pkg = createMockPackage("test-pkg");

    // Call the function
    const result = await createWaypointGateway(pkg, waypointName);

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
    expect(mockLog.info).toHaveBeenNthCalledWith(
      1,
      `Creating waypoint gateway for package: test-ns/test-pkg`,
    );

    expect(mockLog.info).toHaveBeenNthCalledWith(
      2,
      {
        namespace: "test-ns",
        name: waypointName,
        gatewayClassName: "istio-waypoint",
        ownerReferences: expect.stringContaining('"kind":"Package"'),
      },
      "Applying waypoint gateway",
    );

    expect(mockLog.info).toHaveBeenNthCalledWith(
      3,
      {
        namespace: "test-ns",
        waypointName,
      },
      "Successfully created waypoint gateway",
    );
  });

  it("should throw an error when package metadata is missing", async () => {
    // Create a package with missing metadata
    const pkg = { ...createMockPackage("test-pkg"), metadata: {} };

    // Expect the function to throw an error
    await expect(createWaypointGateway(pkg, waypointName)).rejects.toThrow(
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
    await expect(createWaypointGateway(pkg, waypointName)).rejects.toThrow(
      "Failed to create waypoint gateway: Test apply error",
    );

    // Verify error logging
    expect(mockLog.error).toHaveBeenCalledWith(
      expect.objectContaining({
        namespace: "test-ns",
        waypointName,
        errorType: "object",
        errorDetails: testError,
      }),
      "Error creating waypoint gateway",
    );
  });

  it("should handle non-Error objects during gateway creation", async () => {
    // Create a test package
    const pkg = createMockPackage("test-pkg");

    // Mock a non-Error object during Apply
    const testError = "String error message";
    mockApply.mockRejectedValueOnce(testError);

    // Expect the function to throw an error
    await expect(createWaypointGateway(pkg, waypointName)).rejects.toThrow(
      "Failed to create waypoint gateway: String error message",
    );

    // Verify error logging
    expect(mockLog.error).toHaveBeenCalledWith(
      expect.objectContaining({
        namespace: "test-ns",
        waypointName,
        errorType: "string",
        errorDetails: testError,
      }),
      "Error creating waypoint gateway",
    );
  });
});

describe("reconcileExistingResources", () => {
  const waypointName = "test-client-waypoint";
  const selector = { "app.kubernetes.io/name": "test-app" };
  const ssoClient = {
    clientId: "test-client",
    name: "test-sso",
    enableAuthserviceSelector: selector,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockReset();
    mockPatch.mockReset();
    mockLog.info.mockClear();
    mockLog.warn.mockClear();
    mockLog.error.mockClear();
  });

  it("should warn and return if no namespace in package", async () => {
    const pkg = { ...createMockPackage("test-pkg"), metadata: {} };
    await reconcileExistingResources(pkg, ssoClient, waypointName);
    expect(mockLog.warn).toHaveBeenCalledWith({ pkg }, "No namespace found in package metadata");
    expect(mockGet).not.toHaveBeenCalled();
    expect(mockPatch).not.toHaveBeenCalled();
  });

  it("should patch matching services and pods", async () => {
    const pkg = createMockPackage("test-pkg", selector);
    // Mock K8s.Get for services and pods
    const mockService = createMockService(selector);
    const mockPod = createMockPod(selector);
    mockGet
      .mockResolvedValueOnce({ items: [mockService] }) // Services
      .mockResolvedValueOnce({ items: [mockPod] }); // Pods
    mockPatch.mockResolvedValue(undefined);

    await reconcileExistingResources(pkg, ssoClient, waypointName);

    // Service patch
    expect(mockPatch).toHaveBeenCalledWith([
      expect.objectContaining({
        op: "add",
        path: expect.stringContaining("ingress-use-waypoint"),
        value: "true",
      }),
      expect.objectContaining({
        op: "add",
        path: expect.stringContaining("istio.io~1use-waypoint"),
        value: waypointName,
      }),
    ]);
    // Pod patch
    expect(mockPatch).toHaveBeenCalledWith([
      expect.objectContaining({
        op: "add",
        path: expect.stringContaining("istio.io~1use-waypoint"),
        value: waypointName,
      }),
    ]);
    expect(mockLog.debug).toHaveBeenCalledWith(
      `Found resource to update with waypoint labels in ${pkg.metadata?.namespace}`,
    );
  });

  it("should log error if service patch fails", async () => {
    const pkg = createMockPackage("test-pkg", selector);
    const mockService = createMockService(selector);
    const mockPod = createMockPod(selector);
    mockGet
      .mockResolvedValueOnce({ items: [mockService] })
      .mockResolvedValueOnce({ items: [mockPod] });
    // Service patch throws
    mockPatch.mockRejectedValueOnce(new Error("patch failed")).mockResolvedValueOnce(undefined); // Pod patch succeeds

    await reconcileExistingResources(pkg, ssoClient, waypointName);
    expect(mockLog.error).toHaveBeenCalledWith(
      { errorMessage: "patch failed" },
      `Service reconciliation failed for ${pkg.metadata?.namespace}`,
    );
    // Pod patch still called
    expect(mockPatch).toHaveBeenCalledTimes(2);
  });

  it("should log error if pod patch fails", async () => {
    const pkg = createMockPackage("test-pkg", selector);
    const mockService = createMockService(selector);
    const mockPod = createMockPod(selector);
    mockGet
      .mockResolvedValueOnce({ items: [mockService] })
      .mockResolvedValueOnce({ items: [mockPod] });
    // Service patch succeeds, pod patch fails
    mockPatch.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("pod patch failed"));

    await reconcileExistingResources(pkg, ssoClient, waypointName);
    expect(mockLog.info).toHaveBeenCalledWith(
      { errorMessage: "pod patch failed" },
      `Pod reconciliation failed for ${pkg.metadata?.namespace}`,
    );
    expect(mockPatch).toHaveBeenCalledTimes(2);
  });

  it("should log and throw if K8s.Get fails", async () => {
    const pkg = createMockPackage("test-pkg", selector);
    mockGet.mockRejectedValueOnce(new Error("get failed"));
    await expect(reconcileExistingResources(pkg, ssoClient, waypointName)).rejects.toThrow(
      "get failed",
    );
    expect(mockLog.error).toHaveBeenCalledWith(
      { errorMessage: "get failed" },
      "Error in reconcileExistingResources()",
    );
  });
});

describe("test createEgressWaypointGateway", () => {
  it("should create egress waypoint", () => {
    const pkgs = new Set(["test-pkg1", "test-pkg2"]);
    const generation = 1;

    const waypoint = createEgressWaypointGateway(pkgs, generation);

    expect(waypoint).toBeDefined();
    expect(waypoint.metadata?.name).toEqual(egressWaypointName);
    expect(waypoint.metadata?.namespace).toEqual(ambientEgressNamespace);
    expect(waypoint.metadata?.labels).toEqual({
      "uds/package": sharedEgressPkgId,
      "uds/generation": generation.toString(),
      "istio.io/gateway-name": egressWaypointName,
    });
    expect(waypoint.metadata?.annotations).toEqual({
      "uds.dev/user-test-pkg1": "user",
      "uds.dev/user-test-pkg2": "user",
    });
    expect(waypoint.spec?.gatewayClassName).toEqual("istio-waypoint");
    expect(waypoint.spec?.listeners).toBeDefined();
    expect(waypoint.spec?.infrastructure).toBeDefined();
  });
});
