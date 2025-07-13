/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { K8s, a } from "pepr";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import type { UDSPackage } from "../../crd";
import { K8sGateway } from "../../crd";
import { PackageStore } from "../packages/package-store";
import * as ambientWaypoint from "./ambient-waypoint";
import { generateWaypointNetworkPolicies } from "./ambient-waypoint";

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
import * as istioResources from "./istio-resources";

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
const mockLog = (istioResources as typeof import("./istio-resources")).log;

describe("ambient-waypoint", () => {
  // Reset all mocks before each test
  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default mock implementations
    mockInNamespace.mockReturnThis();
    mockWithLabel.mockReturnThis();

    // Reset environment variables
    process.env.WAYPOINT_HEALTH_MAX_ATTEMPTS = "10";
    process.env.WAYPOINT_HEALTH_INTERVAL_MS = "5000";
    process.env.WAYPOINT_HEALTH_TIMEOUT_MS = "60000";
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("unregisterAmbientPackage", () => {
    const waypointId = "test-waypoint";
    const namespace = "test-ns";
    const name = "test-pkg";
    const waypointName = `uds-core-${waypointId}-waypoint`;
    let pkg: UDSPackage;

    beforeEach(() => {
      // Reset mocks before each test
      vi.clearAllMocks();

      // Create a default valid package for tests
      pkg = {
        metadata: {
          namespace,
          name,
        },
      } as UDSPackage;
    });

    it("should skip unregistration when package metadata is missing namespace", async () => {
      delete pkg.metadata!.namespace;

      // Act
      await ambientWaypoint.unregisterAmbientPackage(pkg, waypointId);

      // Assert
      expect(mockLog.warn).toHaveBeenCalledWith(
        "Package metadata is missing namespace or name, skipping unregistration",
      );
      expect(mockDelete).not.toHaveBeenCalled();
    });

    it("should skip unregistration when package metadata is missing name", async () => {
      delete pkg.metadata!.name;

      // Act
      await ambientWaypoint.unregisterAmbientPackage(pkg, waypointId);

      // Assert
      expect(mockLog.warn).toHaveBeenCalledWith(
        "Package metadata is missing namespace or name, skipping unregistration",
      );
      expect(mockDelete).not.toHaveBeenCalled();
    });

    it("should log gateway cleanup and success when unregistering a valid package", async () => {
      // Act
      await ambientWaypoint.unregisterAmbientPackage(pkg, waypointId);

      // Assert
      // Verify gateway cleanup logging
      expect(mockLog.info).toHaveBeenNthCalledWith(1, "Deleting waypoint gateway", {
        namespace,
        package: name,
        waypointName,
        waypointId,
      });

      // Verify debug log for garbage collection
      expect(mockLog.debug).toHaveBeenCalledWith(
        "Waypoint gateway will be garbage collected by owner reference",
        {
          namespace,
          package: name,
          waypointName,
          waypointId,
        },
      );

      // Verify success log
      expect(mockLog.info).toHaveBeenNthCalledWith(
        2,
        "Successfully unregistered ambient waypoint",
        {
          namespace,
          package: name,
          waypointName,
          waypointId,
        },
      );
    });

    it("should log error and rethrow when gateway cleanup fails", async () => {
      const error = new Error("Gateway cleanup failed");
      mockLog.debug = vi.fn().mockImplementationOnce(() => {
        throw error;
      });

      await expect(ambientWaypoint.unregisterAmbientPackage(pkg, waypointId)).rejects.toThrow(
        "Failed to clean up ambient waypoint: Gateway cleanup failed",
      );

      // Verify error logging
      expect(mockLog.error).toHaveBeenCalledWith("Error during waypoint gateway cleanup", {
        error,
        namespace,
        package: name,
        waypointName,
        waypointId,
      });

      // Verify the error is rethrown with proper message
      expect(mockLog.error).toHaveBeenLastCalledWith(
        "Failed to clean up ambient waypoint resources",
        {
          error: "Gateway cleanup failed",
          namespace,
          package: name,
          waypointName,
          waypointId,
        },
      );
    });
  });

  describe("getWaypointName", () => {
    it("should add uds-core prefix and waypoint suffix when not present", () => {
      const result = ambientWaypoint.getWaypointName("test");
      expect(result).toBe("uds-core-test-waypoint");
    });

    it("should not add duplicate uds-core prefix", () => {
      const result = ambientWaypoint.getWaypointName("uds-core-test");
      expect(result).toBe("uds-core-test-waypoint");
    });
  });

  describe("createManagedLabels", () => {
    it("should create labels with package information and waypoint name", () => {
      const pkg = {
        metadata: {
          name: "test-pkg",
          namespace: "test-ns",
        },
      } as UDSPackage;

      const result = ambientWaypoint.createManagedLabels(pkg, "test-waypoint");

      expect(result).toEqual({
        "uds/managed-by": "uds-operator",
        "uds/package": "test-pkg",
        "uds/namespace": "test-ns",
        "istio.io/use-waypoint": "test-waypoint",
      });
    });
  });

  describe("isGatewayReady", () => {
    it("should return true when gateway has both Accepted and Programmed conditions set to True", () => {
      const gateway = {
        status: {
          conditions: [
            {
              type: "Accepted",
              status: "True",
              lastTransitionTime: new Date().toISOString(),
              message: "Gateway is accepted",
              reason: "Accepted",
            },
            {
              type: "Programmed",
              status: "True",
              lastTransitionTime: new Date().toISOString(),
              message: "Gateway is programmed",
              reason: "Programmed",
            },
          ],
        },
      } as const;

      // Using type assertion to bypass type checking for test purposes
      expect(ambientWaypoint.isGatewayReady(gateway as unknown as K8sGateway)).toBe(true);
    });

    it("should return false when gateway is missing conditions", () => {
      const gateway = {
        status: { conditions: [] },
      } as const;

      // Using type assertion to bypass type checking for test purposes
      expect(ambientWaypoint.isGatewayReady(gateway as unknown as K8sGateway)).toBe(false);
    });
  });

  describe("isWaypointPodHealthy", () => {
    const mockPod = (status: {
      phase: string;
      containerStatuses: Array<{ name: string; ready: boolean; restartCount?: number }>;
    }) => ({
      metadata: {
        name: "test-pod",
        namespace: "test-ns",
      },
      status,
    });

    beforeEach(() => {
      // Reset mocks before each test
      mockGet.mockReset();
      mockInNamespace.mockReset();
      mockWithLabel.mockReset();

      // Setup default mock implementations
      mockInNamespace.mockReturnThis();
      mockWithLabel.mockReturnThis();
    });

    it("should return true when pod is running and all containers are ready", async () => {
      const healthyPod = mockPod({
        phase: "Running",
        containerStatuses: [
          { name: "istio-proxy", ready: true, restartCount: 0 },
          { name: "app", ready: true },
        ],
      });

      mockGet.mockResolvedValue({ items: [healthyPod] });

      const result = await ambientWaypoint.isWaypointPodHealthy("test-ns", "test-waypoint");
      expect(result).toBe(true);

      // Verify K8s client was called with correct parameters
      expect(mockInNamespace).toHaveBeenCalledWith("test-ns");
      expect(mockWithLabel).toHaveBeenCalledWith("istio.io/gateway-name=test-waypoint");
    });

    it("should return false when pod is not running", async () => {
      const pendingPod = mockPod({
        phase: "Pending",
        containerStatuses: [{ name: "istio-proxy", ready: false }],
      });

      mockGet.mockResolvedValue({ items: [pendingPod] });

      const result = await ambientWaypoint.isWaypointPodHealthy("test-ns", "test-waypoint");
      expect(result).toBe(false);
    });

    it("should return false when istio-proxy container is not ready", async () => {
      const unhealthyPod = mockPod({
        phase: "Running",
        containerStatuses: [
          { name: "istio-proxy", ready: false },
          { name: "app", ready: true },
        ],
      });

      mockGet.mockResolvedValue({ items: [unhealthyPod] });

      const result = await ambientWaypoint.isWaypointPodHealthy("test-ns", "test-waypoint");
      expect(result).toBe(false);
    });

    it("should log a warning when istio-proxy container has restarted", async () => {
      const restartedPod = mockPod({
        phase: "Running",
        containerStatuses: [
          { name: "istio-proxy", ready: true, restartCount: 1 },
          { name: "app", ready: true },
        ],
      });

      mockGet.mockResolvedValue({ items: [restartedPod] });

      const result = await ambientWaypoint.isWaypointPodHealthy("test-ns", "test-waypoint");

      // Should still return true despite the warning
      expect(result).toBe(true);

      // Verify warning was logged with the correct message format
      expect(mockLog.warn).toHaveBeenCalledWith(
        `istio-proxy container for waypoint test-waypoint in pod test-pod has restarted 1 times`,
        {
          namespace: "test-ns",
        },
      );
    });

    it("should return false when no pods are found", async () => {
      mockGet.mockResolvedValue({ items: [] });

      const result = await ambientWaypoint.isWaypointPodHealthy("test-ns", "test-waypoint");
      expect(result).toBe(false);
    });
  });

  describe("createWaypointGateway", () => {
    interface SSOConfig {
      enableAuthserviceSelector: Record<string, string>;
      clientId: string;
      name: string;
    }

    const mockPackage = (ssoConfig?: SSOConfig): UDSPackage => ({
      metadata: {
        name: "test-pkg",
        namespace: "test-ns",
        uid: "test-uid",
      },
      spec: {
        sso: ssoConfig ? [ssoConfig] : [],
      },
    });

    const mockGateway = (ready = true) => ({
      metadata: {
        name: "uds-core-test-waypoint-waypoint",
      },
      status: {
        conditions: [
          { type: "Accepted", status: ready ? "True" : "False" },
          { type: "Programmed", status: ready ? "True" : "False" },
        ],
      },
    });

    // Mock the K8s Gateway class
    const MockK8sGateway = vi.fn().mockImplementation(() => ({
      metadata: {},
      spec: {},
    }));

    // Create a mock for the K8s Gateway client
    const mockK8sGatewayClient = {
      InNamespace: vi.fn().mockReturnThis(),
      Get: mockGet,
      Apply: mockApply,
    };

    beforeEach(() => {
      vi.clearAllMocks();

      // Mock the K8s client to handle both Pod and Gateway types
      // Mock the K8s client with proper type assertions
      (K8s as unknown as Mock).mockImplementation((kind: unknown) => {
        if (kind === a.Pod) {
          return {
            InNamespace: () => ({
              WithLabel: () => ({
                Get: mockGet,
              }),
            }),
          };
        }
        // For K8sGateway, return our mock client
        return mockK8sGatewayClient;
      });

      // Reset the mock implementation for each test
      mockK8sGatewayClient.InNamespace.mockReturnValue({
        Get: mockGet,
        Apply: mockApply,
      });

      // Mock the K8sGateway static methods
      Object.assign(MockK8sGateway, {
        kind: "Gateway",
        group: "gateway.networking.k8s.io",
        version: "v1beta1",
        isNamespaced: true,
        isList: false,
        names: {
          plural: "gateways",
          singular: "gateway",
          kind: "Gateway",
          shortNames: [],
        },
      });
    });

    it("should throw an error if package metadata is missing", async () => {
      const pkg = { metadata: {} } as UDSPackage;
      await expect(ambientWaypoint.createWaypointGateway(pkg, "test-waypoint")).rejects.toThrow(
        "Package metadata is missing namespace or name",
      );
    });

    it("should return existing gateway if it is ready", async () => {
      const pkg = mockPackage();
      const waypointName = "uds-core-test-waypoint-waypoint";
      const mockGatewayObj = mockGateway(true);

      mockGet.mockResolvedValue(mockGatewayObj);

      const result = await ambientWaypoint.createWaypointGateway(pkg, "test-waypoint");

      expect(result).toBe(waypointName);
      expect(mockGet).toHaveBeenCalledWith(waypointName);
      expect(mockApply).not.toHaveBeenCalled();

      // Verify logs
      expect(mockLog.info).toHaveBeenCalledWith(
        "Creating waypoint gateway for package: test-ns/test-pkg",
        { waypointName: "uds-core-test-waypoint-waypoint" },
      );
      expect(mockLog.info).toHaveBeenCalledWith("Waypoint Gateway already exists and is ready", {
        namespace: "test-ns",
        waypointName: "uds-core-test-waypoint-waypoint",
      });
    });

    it("should log and continue if gateway exists but is not ready", async () => {
      const pkg = mockPackage();
      const waypointName = "uds-core-test-waypoint-waypoint";
      const mockGatewayObj = mockGateway(false);

      mockGet.mockResolvedValue(mockGatewayObj);

      const result = await ambientWaypoint.createWaypointGateway(pkg, "test-waypoint");

      expect(result).toBe(waypointName);
      expect(mockLog.info).toHaveBeenCalledWith(
        "Waypoint Gateway exists but is not ready, waiting...",
        { namespace: "test-ns", waypointName: "uds-core-test-waypoint-waypoint" },
      );
    });

    it("should create a new gateway if it does not exist", async () => {
      const ssoConfig = {
        enableAuthserviceSelector: { app: "test-app" },
        clientId: "test-client",
        name: "test-sso",
      };
      const pkg = mockPackage(ssoConfig);
      const waypointName = "uds-core-test-waypoint-waypoint";

      // Mock the gateway not existing
      const notFoundError = new Error("Not found") as Error & { statusCode?: number };
      notFoundError.statusCode = 404;
      mockGet.mockRejectedValue(notFoundError);

      // Mock the apply to resolve successfully
      mockApply.mockResolvedValue({});

      const result = await ambientWaypoint.createWaypointGateway(pkg, "test-waypoint");

      expect(result).toBe(waypointName);

      // Verify the gateway was created with correct parameters
      expect(mockApply).toHaveBeenCalled();
      const appliedGateway = mockApply.mock.calls[0][0];

      expect(appliedGateway.metadata).toEqual({
        name: waypointName,
        namespace: "test-ns",
        labels: {
          app: "test-app", // From the SSO config
          "app.kubernetes.io/component": "ambient-waypoint",
          "app.kubernetes.io/name": "test-waypoint",
          "istio.io/gateway-name": waypointName,
          "istio.io/waypoint-for": "all",
          "uds/managed-by": "uds-operator",
          "uds/namespace": "test-ns",
          "uds/package": "test-pkg",
          "istio.io/use-waypoint": waypointName,
        },
        annotations: {
          "uds.dev/created-at": expect.any(String),
        },
        ownerReferences: [
          {
            apiVersion: "uds.dev/v1alpha1",
            kind: "Package",
            name: "test-pkg",
            uid: "test-uid",
          },
        ],
      });

      expect(appliedGateway.spec).toEqual({
        gatewayClassName: "istio-waypoint",
        listeners: [
          {
            name: "mesh",
            port: 15008,
            protocol: "HBONE",
          },
        ],
      });

      // Verify logs
      expect(mockLog.debug).toHaveBeenCalledWith(
        "Waypoint Gateway not found, creating new one",
        expect.objectContaining({
          namespace: "test-ns",
          waypointName: "uds-core-test-waypoint-waypoint",
          error: "Not found",
        }),
      );
      expect(mockLog.info).toHaveBeenCalledWith("Creating new Waypoint Gateway", {
        namespace: "test-ns",
        waypointName: "uds-core-test-waypoint-waypoint",
      });
    });
  });

  describe("reconcileService", () => {
    const mockService = (labels: Record<string, string> = {}) => ({
      metadata: {
        namespace: "test-ns",
        labels: { ...labels },
      },
      spec: {
        selector: { "app.kubernetes.io/name": "test-app" },
      },
    });

    const mockPackage = (selectors: Array<Record<string, string>> = []) =>
      ({
        metadata: {
          name: "test-pkg",
          namespace: "test-ns",
        },
        spec: {
          sso: selectors.map((selector, index) => ({
            name: `sso-${index}`,
            clientId: `client-${index}`,
            enableAuthserviceSelector: selector,
          })),
        },
      }) as UDSPackage;

    it("should add waypoint labels when service matches selector", async () => {
      const service = mockService();
      const pkg = mockPackage([{ "app.kubernetes.io/name": "test-app" }]);

      // Mock PackageStore to return our test package
      vi.mocked(PackageStore.getAmbientPackagesByNamespace).mockReturnValue([pkg]);

      // Using type assertion to bypass type checking for test purposes
      await ambientWaypoint.reconcileService(service as unknown as a.Service);

      expect(service.metadata.labels).toMatchObject({
        "istio.io/use-waypoint": "uds-core-test-pkg-waypoint",
        "istio.io/ingress-use-waypoint": "true",
      });
    });

    it("should not modify service when no selectors match", async () => {
      const service = mockService();
      const pkg = mockPackage([{ "app.kubernetes.io/name": "non-matching" }]);

      vi.mocked(PackageStore.getAmbientPackagesByNamespace).mockReturnValue([pkg]);

      // Using type assertion to bypass type checking for test purposes
      await ambientWaypoint.reconcileService(service as unknown as a.Service);

      expect(service.metadata.labels).not.toHaveProperty("istio.io/use-waypoint");
      expect(service.metadata.labels).not.toHaveProperty("istio.io/ingress-use-waypoint");
    });

    it("should handle service without namespace", async () => {
      const service = { metadata: {} };

      // Using type assertion to bypass type checking for test purposes
      await ambientWaypoint.reconcileService(service as unknown as a.Service);

      expect(PackageStore.getAmbientPackagesByNamespace).not.toHaveBeenCalled();
    });
  });

  describe("generateWaypointNetworkPolicies", () => {
    const createPackage = (namespace: string, name: string) => ({
      apiVersion: "uds.dev/v1alpha1" as const,
      kind: "Package" as const,
      metadata: {
        name,
        namespace,
        uid: `${namespace}-${name}-uid`,
      },
      spec: {
        // Other spec fields can be added as needed
      },
    });

    beforeEach(() => {
      // Reset mocks before each test
      mockApply.mockReset();
    });

    it("should apply correct network policies for waypoint traffic", async () => {
      // Setup
      const pkg = createPackage("test-ns", "test-pkg");
      const waypointName = "test-waypoint";
      const appSelector = { "app.kubernetes.io/name": "test-app" };

      // Execute
      await generateWaypointNetworkPolicies(pkg, waypointName, appSelector);

      // Verify the K8s client was called with the correct NetworkPolicy objects
      expect(mockApply).toHaveBeenCalledTimes(2);

      // Get the first call (ingress policy)
      const ingressCall = mockApply.mock.calls[0][0];
      expect(ingressCall).toMatchObject({
        apiVersion: "networking.k8s.io/v1",
        kind: "NetworkPolicy",
        metadata: {
          name: `${waypointName}-ingress-from-app`,
          namespace: "test-ns",
          labels: { "uds/managed-by": "uds-operator" },
        },
        spec: {
          podSelector: { matchLabels: { "istio.io/gateway-name": waypointName } },
          ingress: [
            {
              from: [
                {
                  podSelector: { matchLabels: appSelector },
                },
              ],
            },
          ],
          policyTypes: ["Ingress"],
        },
      });

      // Get the second call (egress policy)
      const egressCall = mockApply.mock.calls[1][0];
      expect(egressCall).toMatchObject({
        apiVersion: "networking.k8s.io/v1",
        kind: "NetworkPolicy",
        metadata: {
          name: `${waypointName}-egress-to-app`,
          namespace: "test-ns",
          labels: { "uds/managed-by": "uds-operator" },
        },
        spec: {
          podSelector: { matchLabels: { "istio.io/gateway-name": waypointName } },
          egress: [
            {
              to: [
                {
                  podSelector: { matchLabels: appSelector },
                },
              ],
            },
          ],
          policyTypes: ["Egress"],
        },
      });
    });

    it("should handle empty app selector", async () => {
      // Setup
      const pkg = createPackage("test-ns", "test-pkg");
      const waypointName = "test-waypoint";
      const emptySelector = {};

      // Execute
      await generateWaypointNetworkPolicies(pkg, waypointName, emptySelector);

      // Should still apply both policies
      expect(mockApply).toHaveBeenCalledTimes(2);
    });

    it("should not apply any policies when no namespace is provided", async () => {
      // Setup
      const pkg = createPackage("", "test-pkg");
      const waypointName = "test-waypoint";
      const appSelector = { "app.kubernetes.io/name": "test-app" };

      // Execute
      await generateWaypointNetworkPolicies(pkg, waypointName, appSelector);

      // Should not call K8s.Apply when no namespace is provided
      expect(mockApply).not.toHaveBeenCalled();
    });
  });

  describe("reconcilePod", () => {
    const mockPod = (labels: Record<string, string> = {}) => ({
      metadata: {
        namespace: "test-ns",
        labels: { ...labels },
      },
      spec: {
        containers: [],
      },
    });

    const mockPackage = (selectors: Array<Record<string, string>> = []) =>
      ({
        metadata: {
          name: "test-pkg",
          namespace: "test-ns",
        },
        spec: {
          sso: selectors.map((selector, index) => ({
            name: `sso-${index}`,
            clientId: `client-${index}`,
            enableAuthserviceSelector: selector,
          })),
        },
      }) as UDSPackage;

    it("should add waypoint labels when pod matches selector", async () => {
      const pod = mockPod({ "app.kubernetes.io/name": "test-app" });
      const pkg = mockPackage([{ "app.kubernetes.io/name": "test-app" }]);

      vi.mocked(PackageStore.getAmbientPackagesByNamespace).mockReturnValue([pkg]);

      // Using type assertion to bypass type checking for test purposes
      await ambientWaypoint.reconcilePod(pod as unknown as a.Pod);

      expect(pod.metadata.labels).toMatchObject({
        "istio.io/use-waypoint": "uds-core-test-pkg-waypoint",
      });
    });

    it("should not modify pod when no selectors match", async () => {
      const pod = mockPod({ "app.kubernetes.io/name": "test-app" });
      const pkg = mockPackage([{ "app.kubernetes.io/name": "non-matching" }]);

      vi.mocked(PackageStore.getAmbientPackagesByNamespace).mockReturnValue([pkg]);

      // Using type assertion to bypass type checking for test purposes
      await ambientWaypoint.reconcilePod(pod as unknown as a.Pod);

      expect(pod.metadata.labels).not.toHaveProperty("istio.io/use-waypoint");
    });

    it("should handle pod without namespace", async () => {
      const pod = { metadata: {} };

      // Using type assertion to bypass type checking for test purposes
      await ambientWaypoint.reconcilePod(pod as unknown as a.Pod);

      expect(PackageStore.getAmbientPackagesByNamespace).not.toHaveBeenCalled();
    });

    it("should handle multiple selectors with OR logic", async () => {
      const pod = mockPod({ "app.kubernetes.io/name": "test-app" });
      const pkg = mockPackage([
        { "app.kubernetes.io/name": "non-matching" },
        { "app.kubernetes.io/name": "test-app" }, // This one matches
      ]);

      vi.mocked(PackageStore.getAmbientPackagesByNamespace).mockReturnValue([pkg]);

      // Using type assertion to bypass type checking for test purposes
      await ambientWaypoint.reconcilePod(pod as unknown as a.Pod);

      expect(pod.metadata.labels).toHaveProperty("istio.io/use-waypoint");
    });
  });

  describe("registerAmbientPackage", () => {
    it("should log a warning and return early when package has no namespace", async () => {
      const mockPackage = {
        metadata: {
          // No namespace provided
        },
      } as UDSPackage;
      const waypointId = "test-waypoint";

      // Act
      await ambientWaypoint.registerAmbientPackage(mockPackage, waypointId);

      // Assert
      expect(mockLog.warn).toHaveBeenCalledWith("Cannot register package without a namespace", {
        waypointId: "test-waypoint",
      });

      // Verify no K8s calls were made
      expect(mockGet).not.toHaveBeenCalled();
      expect(mockApply).not.toHaveBeenCalled();
    });

    it("should process package with namespace and SSO selectors", async () => {
      const mockPackage = {
        metadata: {
          name: "test-pkg",
          namespace: "test-ns",
        },
        spec: {
          sso: [
            {
              enableAuthserviceSelector: { "app.kubernetes.io/name": "test-app" },
              clientId: "test-client",
              name: "test-sso",
            },
          ],
        },
      } as UDSPackage;

      const waypointId = "test-waypoint";

      // Create a mock K8s client that captures the parameters
      const mockK8s = K8s as unknown as Mock;

      // Track the calls to verify parameters
      const serviceCalls: { namespace?: string; labels?: string }[] = [];
      const podCalls: { namespace?: string; labels?: string }[] = [];

      mockK8s.mockImplementation(kind => {
        if (kind === a.Service) {
          return {
            InNamespace: (namespace: string) => ({
              WithLabel: (labels: string) => {
                serviceCalls.push({ namespace, labels });
                return {
                  Get: vi.fn().mockResolvedValue({ items: [] }),
                };
              },
            }),
          };
        } else if (kind === a.Pod) {
          return {
            InNamespace: (namespace: string) => ({
              WithLabel: (labels: string) => {
                podCalls.push({ namespace, labels });
                return {
                  Get: vi.fn().mockResolvedValue({ items: [] }),
                };
              },
            }),
          };
        }
        return {};
      });

      // Act - Just verify the function doesn't throw
      await expect(
        ambientWaypoint.registerAmbientPackage(mockPackage, waypointId),
      ).resolves.not.toThrow();

      // Verify K8s was called with the correct parameters
      expect(mockK8s).toHaveBeenCalledWith(a.Service);
      expect(mockK8s).toHaveBeenCalledWith(a.Pod);

      // Verify the service and pod queries used the correct namespace and labels
      expect(serviceCalls).toHaveLength(1);
      expect(serviceCalls[0].namespace).toBe("test-ns");
      expect(serviceCalls[0].labels).toBe("app.kubernetes.io/name=test-app");

      expect(podCalls).toHaveLength(1);
      expect(podCalls[0].namespace).toBe("test-ns");
      expect(podCalls[0].labels).toBe("app.kubernetes.io/name=test-app");

      expect(mockLog.error).not.toHaveBeenCalled();
    });

    it("should handle errors when K8s client fails", async () => {
      const mockPackage = {
        metadata: {
          name: "test-pkg",
          namespace: "test-ns",
        },
        spec: {
          sso: [
            {
              enableAuthserviceSelector: { "app.kubernetes.io/name": "test-app" },
              clientId: "test-client",
              name: "test-sso",
            },
          ],
        },
      } as UDSPackage;

      const waypointId = "test-waypoint";
      const errorMessage = "K8s client error";

      // Mock the K8s client to throw an error for Service query
      const mockK8s = K8s as unknown as Mock;

      mockK8s.mockImplementation(kind => {
        if (kind === a.Service) {
          return {
            InNamespace: () => ({
              WithLabel: () => ({
                Get: vi.fn().mockRejectedValue(new Error(errorMessage)),
              }),
            }),
          };
        } else if (kind === a.Pod) {
          return {
            InNamespace: () => ({
              WithLabel: () => ({
                Get: vi.fn().mockResolvedValue({ items: [] }),
              }),
            }),
          };
        }
        return {};
      });

      await expect(
        ambientWaypoint.registerAmbientPackage(mockPackage, waypointId),
      ).resolves.not.toThrow();

      // Verify the error was logged
      expect(mockLog.error).toHaveBeenCalledWith(
        `Error reconciling resources for package test-pkg in namespace test-ns`,
        {
          error: expect.any(Error),
          namespace: "test-ns",
          waypointId: "test-waypoint",
        },
      );
    });
  });

  describe("setupAmbientWaypoint", () => {
    const waypointId = "test-waypoint";
    let pkg: UDSPackage;

    beforeEach(() => {
      vi.clearAllMocks();

      pkg = {
        metadata: {
          namespace: "test-ns",
          name: "test-pkg",
          uid: "test-uid",
        },
        spec: {
          sso: [
            {
              enableAuthserviceSelector: { "app.kubernetes.io/name": "test-app" },
              clientId: "client-id",
              name: "test-sso",
            },
          ],
        },
      } as UDSPackage;

      vi.spyOn(ambientWaypoint, "createWaypointGateway").mockResolvedValue(
        "uds-core-test-pkg-waypoint",
      );
      vi.spyOn(ambientWaypoint, "generateWaypointNetworkPolicies").mockResolvedValue();
    });

    it("should throw an error when package metadata is missing namespace", async () => {
      delete pkg.metadata!.namespace;

      await expect(ambientWaypoint.setupAmbientWaypoint(pkg, waypointId)).rejects.toThrow(
        "Package metadata is missing namespace or name",
      );
    });

    it("should throw an error when package metadata is missing name", async () => {
      delete pkg.metadata!.name;

      await expect(ambientWaypoint.setupAmbientWaypoint(pkg, waypointId)).rejects.toThrow(
        "Package metadata is missing namespace or name",
      );
    });

    it("should throw an error when package metadata is missing both namespace and name", async () => {
      delete pkg.metadata!.namespace;
      delete pkg.metadata!.name;

      await expect(ambientWaypoint.setupAmbientWaypoint(pkg, waypointId)).rejects.toThrow(
        "Package metadata is missing namespace or name",
      );
    });
  });
});
