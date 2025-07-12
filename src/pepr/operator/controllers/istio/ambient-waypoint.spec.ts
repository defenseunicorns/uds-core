/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns
 */

import { V1ContainerStatus } from "@kubernetes/client-node";
import * as a from "pepr";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { K8sGateway, UDSPackage } from "../../crd";

// Import the module to test
import * as ambientWaypoint from "./ambient-waypoint";

// Mock the K8s API
const mockK8s = {
  InNamespace: vi.fn().mockReturnThis(),
  WithLabel: vi.fn().mockReturnThis(),
  Get: vi.fn(),
  Apply: vi.fn().mockResolvedValue({}),
  Delete: vi.fn().mockResolvedValue({}),
};

vi.mock("pepr", () => ({
  a: {
    Service: {},
    Pod: {},
    K8sGateway: {},
  },
  K8s: vi.fn().mockImplementation(() => mockK8s),
}));

// Mock the PackageStore
vi.mock("../packages/package-store", () => ({
  PackageStore: {
    getAmbientPackagesByNamespace: vi.fn().mockReturnValue([]),
  },
}));

// Mock the logger
vi.mock("./istio-resources", () => ({
  log: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock the getOwnerRef utility
vi.mock("../utils", () => ({
  getOwnerRef: vi.fn().mockReturnValue([{ kind: "Package", name: "test-pkg", uid: "test-uid" }]),
}));

describe("getWaypointName", () => {
  it("should return the correct waypoint name without prefix", () => {
    const waypointId = "test-waypoint";
    const result = ambientWaypoint.getWaypointName(waypointId);
    expect(result).toBe("uds-core-test-waypoint-waypoint");
  });

  it("should not add duplicate uds-core prefix", () => {
    const waypointId = "uds-core-test-waypoint";
    const result = ambientWaypoint.getWaypointName(waypointId);
    expect(result).toBe("uds-core-test-waypoint-waypoint");
  });
});

describe("createManagedLabels", () => {
  it("should create managed labels with package and waypoint information", () => {
    const pkg = {
      metadata: {
        name: "test-pkg",
        namespace: "test-ns",
      },
    } as UDSPackage;

    const waypointName = "test-waypoint";
    const additionalLabels = { "custom/label": "value" };

    const result = ambientWaypoint.createManagedLabels(pkg, waypointName, additionalLabels);

    expect(result).toEqual({
      "uds/managed-by": "uds-operator",
      "uds/package": "test-pkg",
      "uds/namespace": "test-ns",
      "istio.io/use-waypoint": "test-waypoint",
      "custom/label": "value",
    });
  });
});

describe("isGatewayReady", () => {
  it("should return true when gateway has both Accepted and Programmed conditions set to True", () => {
    const gateway: K8sGateway = {
      status: {
        conditions: [
          { type: "Accepted", status: "True" },
          { type: "Programmed", status: "True" },
        ],
      },
    } as K8sGateway;

    expect(ambientWaypoint.isGatewayReady(gateway)).toBe(true);
  });

  it("should return false when gateway is missing conditions", () => {
    const gateway: K8sGateway = {
      status: {},
    } as K8sGateway;

    expect(ambientWaypoint.isGatewayReady(gateway)).toBe(false);
  });

  it("should return false when gateway has only one required condition", () => {
    const gateway: K8sGateway = {
      status: {
        conditions: [
          { type: "Accepted", status: "True" },
          { type: "Programmed", status: "False" },
        ],
      },
    } as K8sGateway;

    expect(ambientWaypoint.isGatewayReady(gateway)).toBe(false);
  });
});

describe("serviceMatchesSelector", () => {
  it("should return true when service matches all selector labels", () => {
    const service = {
      metadata: {
        name: "test-service",
        namespace: "test-ns",
      },
      spec: {
        selector: { "app.kubernetes.io/name": "test-app" },
      },
    } as a.kind.Service;

    const selector = { "app.kubernetes.io/name": "test-app" };
    const matches = ambientWaypoint.serviceMatchesSelector(service, selector);
    expect(matches).toBe(true);
  });

  it("should return false when service does not match selector", () => {
    const service = {
      metadata: {
        name: "test-service",
        namespace: "test-ns",
      },
      spec: {
        selector: { "app.kubernetes.io/name": "test-app" },
      },
    } as a.kind.Service;

    const selector = { "app.kubernetes.io/name": "other-app" };
    const matches = ambientWaypoint.serviceMatchesSelector(service, selector);
    expect(matches).toBe(false);
  });

  it("should return false when service has no selector", () => {
    const service = {
      metadata: {
        name: "test-service",
        namespace: "test-ns",
      },
      spec: {},
    } as a.kind.Service;

    const selector = { "app.kubernetes.io/name": "test-app" };
    const matches = ambientWaypoint.serviceMatchesSelector(service, selector);
    expect(matches).toBe(false);
  });
});

describe("isWaypointPodHealthy", () => {
  const mockPod = (ready: boolean, containerStatuses: V1ContainerStatus[] = []) => ({
    metadata: { name: "test-pod" },
    status: {
      phase: ready ? "Running" : "Pending",
      containerStatuses:
        containerStatuses.length > 0 ? containerStatuses : [{ name: "istio-proxy", ready }],
    },
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return true when all containers are ready", async () => {
    const pod = mockPod(true);
    mockK8s.Get.mockResolvedValueOnce({ items: [pod] });

    const isHealthy = await ambientWaypoint.isWaypointPodHealthy("test-ns", "test-gateway");
    expect(isHealthy).toBe(true);
    expect(mockK8s.InNamespace).toHaveBeenCalledWith("test-ns");
    expect(mockK8s.WithLabel).toHaveBeenCalledWith("istio.io/gateway-name=test-gateway");
  });

  it("should return false when container is not ready", async () => {
    const pod = mockPod(false);
    mockK8s.Get.mockResolvedValueOnce({ items: [pod] });

    const isHealthy = await ambientWaypoint.isWaypointPodHealthy("test-ns", "test-gateway");
    expect(isHealthy).toBe(false);
  });

  it("should return false when pod is not running", async () => {
    const pod = { ...mockPod(true), status: { phase: "Pending" } };
    mockK8s.Get.mockResolvedValueOnce({ items: [pod] });

    const isHealthy = await ambientWaypoint.isWaypointPodHealthy("test-ns", "test-gateway");
    expect(isHealthy).toBe(false);
  });
});

describe("createWaypointGateway", () => {
  const mockPkg = {
    metadata: {
      name: "test-pkg",
      namespace: "test-ns",
      annotations: { "test/annotation": "value" },
    },
    spec: {},
  } as UDSPackage;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should create a new waypoint gateway when none exists", async () => {
    const waypointId = "test-waypoint";
    const waypointName = "uds-core-test-waypoint-waypoint";

    // Reset mocks before this test
    vi.clearAllMocks();

    // Mock the Get to throw a 404 error
    mockK8s.Get.mockRejectedValueOnce({ status: 404 });

    await ambientWaypoint.createWaypointGateway(mockPkg, waypointId);

    // Verify the gateway was created with the correct parameters
    expect(mockK8s.Apply).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          name: waypointName,
          namespace: "test-ns",
          labels: expect.objectContaining({
            "app.kubernetes.io/component": "ambient-waypoint",
            "app.kubernetes.io/name": "test-waypoint",
            "istio.io/waypoint-for": "all",
            "istio.io/gateway-name": waypointName,
          }),
          annotations: expect.objectContaining({
            "uds.dev/created-at": expect.any(String),
            "test/annotation": "value",
          }),
        }),
        spec: {
          gatewayClassName: "istio-waypoint",
          listeners: [
            {
              name: "mesh",
              port: 15008,
              protocol: "HBONE",
            },
          ],
        },
      }),
      { force: true },
    );

    // Verify the namespace was set correctly
    expect(mockK8s.InNamespace).toHaveBeenCalledWith("test-ns");
  });

  it("should use existing gateway if it is already ready", async () => {
    const waypointId = "existing-waypoint";

    // Reset mocks before this test
    vi.clearAllMocks();

    // Mock an existing ready gateway
    mockK8s.Get.mockResolvedValueOnce({
      status: {
        conditions: [
          { type: "Accepted", status: "True" },
          { type: "Programmed", status: "True" },
        ],
      },
    });

    await ambientWaypoint.createWaypointGateway(mockPkg, waypointId);

    // Should not try to create a new gateway
    expect(mockK8s.Apply).not.toHaveBeenCalled();
  });
});
