/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { a, K8s, kind } from "pepr";
import { beforeEach, describe, expect, Mock, test, vi } from "vitest";
import { K8sGateway, UDSPackage } from "../../crd";
import * as ambientWaypoint from "./ambient-waypoint";
import {
  isAmbientEnabled,
  reconcilePod,
  reconcileService,
  setupAmbientWaypoint,
  unregisterAmbientPackage,
} from "./ambient-waypoint";

// Define a type for the ambient waypoint module with the internal function
interface AmbientWaypointModule {
  registerAmbientPackage: (pkg: UDSPackage, clientId: string) => Promise<void>;
  // Include other exported functions as needed
}

// Mock K8s
vi.mock("pepr", () => ({
  K8s: vi.fn(),
  a: {
    Service: "Service",
    Pod: "Pod",
  },
  kind: {
    Namespace: "Namespace",
  },
  Log: {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    child: vi.fn().mockReturnValue({
      info: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
    }),
  },
}));

describe("ambient-waypoint", () => {
  // Mock package for testing
  const testPackage: UDSPackage = {
    apiVersion: "uds.dev/v1alpha1",
    kind: "UDSPackage",
    metadata: {
      name: "test-package",
      namespace: "test-namespace",
      uid: "test-uid",
    },
    spec: {
      sso: [
        {
          clientId: "test-client",
          name: "test-client",
          enableAuthserviceSelector: { app: "test-app" },
        },
      ],
    },
  };

  // Mock K8s implementation
  let mockGet: Mock;
  let mockApply: Mock;
  let mockDelete: Mock;
  let mockInNamespace: Mock;

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset mocks
    mockGet = vi.fn();
    mockApply = vi.fn().mockResolvedValue({});
    mockDelete = vi.fn().mockResolvedValue({});
    mockInNamespace = vi.fn().mockReturnValue({
      Get: mockGet,
      Delete: mockDelete,
    });

    // Setup K8s mock implementation
    (K8s as Mock).mockImplementation(resource => {
      if (resource === kind.Namespace) {
        return {
          Get: mockGet,
        };
      } else if (resource === K8sGateway) {
        return {
          InNamespace: mockInNamespace,
          Apply: mockApply,
        };
      } else if (resource === a.Service || resource === a.Pod) {
        return {
          InNamespace: mockInNamespace,
        };
      }
      return {
        Get: mockGet,
        Apply: mockApply,
        Delete: mockDelete,
        InNamespace: mockInNamespace,
      };
    });
  });

  describe("isAmbientEnabled", () => {
    test("should return true when namespace has ambient mode enabled", async () => {
      // Mock namespace with ambient mode enabled
      mockGet.mockResolvedValue({
        metadata: {
          labels: {
            "istio.io/dataplane-mode": "ambient",
          },
        },
      });

      const result = await isAmbientEnabled("test-namespace");

      expect(result).toBe(true);
      expect(mockGet).toHaveBeenCalledWith("test-namespace");
    });

    test("should return false when namespace does not have ambient mode enabled", async () => {
      // Mock namespace without ambient mode
      mockGet.mockResolvedValue({
        metadata: {
          labels: {},
        },
      });

      const result = await isAmbientEnabled("test-namespace");

      expect(result).toBe(false);
      expect(mockGet).toHaveBeenCalledWith("test-namespace");
    });

    test("should return false when namespace check throws an error", async () => {
      // Mock error when getting namespace
      mockGet.mockRejectedValue(new Error("Namespace not found"));

      const result = await isAmbientEnabled("test-namespace");

      expect(result).toBe(false);
      expect(mockGet).toHaveBeenCalledWith("test-namespace");
    });
  });

  describe("setupAmbientWaypoint", () => {
    test("should create waypoint gateway and wait for pod health", async () => {
      // Create a simplified test that focuses on the high-level functionality
      // rather than the internal implementation details

      // Setup mocks
      const mockApplyGateway = vi.fn().mockResolvedValue({});
      const mockGetPods = vi.fn().mockResolvedValue({
        items: [
          {
            metadata: {
              name: "test-client-waypoint-pod",
              labels: {
                "istio.io/gateway-name": "test-client-waypoint",
              },
            },
            status: {
              phase: "Running",
              containerStatuses: [
                {
                  name: "istio-proxy",
                  ready: true,
                  restartCount: 0,
                },
              ],
              conditions: [
                {
                  type: "Ready",
                  status: "True",
                },
              ],
            },
          },
        ],
      });

      // Setup K8s mock with specific implementations for each resource type
      (K8s as Mock).mockImplementation(resource => {
        if (resource === K8sGateway) {
          return {
            Apply: mockApplyGateway,
            InNamespace: () => ({
              Get: vi.fn().mockRejectedValue({ status: 404 }), // Gateway not found
              Delete: vi.fn().mockResolvedValue({}),
            }),
          };
        } else if (resource === a.Pod) {
          return {
            InNamespace: () => ({
              Get: mockGetPods,
            }),
          };
        }
        return {
          Get: mockGet,
          Apply: mockApply,
          InNamespace: mockInNamespace,
        };
      });

      // Set environment variables for testing
      const originalEnv = process.env;
      process.env.WAYPOINT_HEALTH_MAX_ATTEMPTS = "1";
      process.env.WAYPOINT_HEALTH_INTERVAL_MS = "10";

      try {
        // Execute the function under test
        await setupAmbientWaypoint(testPackage, "test-client");

        // Verify gateway was created
        expect(mockApplyGateway).toHaveBeenCalledWith(
          expect.objectContaining({
            metadata: expect.objectContaining({
              name: "test-client-waypoint",
              namespace: "test-namespace",
            }),
            spec: expect.objectContaining({
              gatewayClassName: "istio-waypoint",
            }),
          }),
          expect.anything(),
        );
      } finally {
        // Restore environment
        process.env = originalEnv;
      }
    });

    test("should throw error when package metadata is missing", async () => {
      const invalidPackage: UDSPackage = {
        apiVersion: "uds.dev/v1alpha1",
        kind: "UDSPackage",
        metadata: {},
      };

      await expect(setupAmbientWaypoint(invalidPackage, "test-client")).rejects.toThrow(
        "Package metadata is missing namespace or name",
      );
    });
  });

  describe("unregisterAmbientPackage", () => {
    test("should delete waypoint gateway", async () => {
      await unregisterAmbientPackage(testPackage, "test-client");

      expect(mockInNamespace).toHaveBeenCalledWith("test-namespace");
      expect(mockDelete).toHaveBeenCalledWith("test-client-waypoint");
    });

    test("should handle 404 errors gracefully", async () => {
      // Mock gateway not found
      mockDelete.mockRejectedValue({ status: 404 });

      await expect(unregisterAmbientPackage(testPackage, "test-client")).resolves.not.toThrow();
    });

    test("should throw other errors", async () => {
      // Mock other error
      mockDelete.mockRejectedValue(new Error("Connection refused"));

      await expect(unregisterAmbientPackage(testPackage, "test-client")).rejects.toThrow(
        "Failed to clean up ambient waypoint",
      );
    });
  });

  describe("reconcileService", () => {
    test("should update service with waypoint labels when it matches selectors", async () => {
      // Create a service that matches the selector
      const service = {
        metadata: {
          name: "test-service",
          namespace: "test-namespace",
          labels: {},
        },
        spec: {
          selector: {
            app: "test-app",
          },
        },
      };

      // Register the package first (this is normally done by setupAmbientWaypoint)
      await (ambientWaypoint as unknown as AmbientWaypointModule).registerAmbientPackage(
        testPackage,
        "test-client",
      );

      // Now reconcile the service
      await reconcileService(service);

      // Verify service was updated with waypoint labels
      expect(service.metadata.labels).toEqual(
        expect.objectContaining({
          "istio.io/use-waypoint": "test-client-waypoint",
          "istio.io/ingress-use-waypoint": "true",
          "uds/managed-by": "uds-operator",
        }),
      );
    });
  });

  describe("reconcilePod", () => {
    test("should update pod with waypoint labels when it matches selectors", async () => {
      // Create a pod that matches the selector
      const pod = {
        metadata: {
          name: "test-pod",
          namespace: "test-namespace",
          labels: {
            app: "test-app",
          },
        },
      };

      // Register the package first (this is normally done by setupAmbientWaypoint)
      await (ambientWaypoint as unknown as AmbientWaypointModule).registerAmbientPackage(
        testPackage,
        "test-client",
      );

      // Now reconcile the pod
      await reconcilePod(pod);

      // Verify pod was updated with waypoint labels
      expect(pod.metadata.labels).toEqual(
        expect.objectContaining({
          "istio.io/use-waypoint": "test-client-waypoint",
          "uds/managed-by": "uds-operator",
        }),
      );
    });
  });
});
