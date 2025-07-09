/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { afterEach, beforeEach, describe, expect, Mock, MockedFunction, test, vi } from "vitest";

// ---- Vitest mocks ----
vi.mock("kubernetes-fluent-client");
vi.mock("../../config");
vi.mock("../controllers/istio/namespace", () => ({ cleanupNamespace: vi.fn() }));
vi.mock("../controllers/keycloak/client-sync", () => ({ purgeSSOClients: vi.fn() }));
vi.mock("../controllers/keycloak/authservice/authservice", () => ({
  purgeAuthserviceClients: vi.fn(),
}));
vi.mock("../controllers/utils", () => ({
  retryWithDelay: vi.fn(async <T>(fn: () => Promise<T>) => fn()),
}));
vi.mock(".", async () => {
  const originalModule = (await vi.importActual(".")) as object;
  return { ...originalModule, writeEvent: vi.fn() };
});
vi.mock("../controllers/istio/egress", async () => {
  const originalModule = (await vi.importActual("../controllers/istio/egress")) as object;
  return {
    ...originalModule,
    reconcileSharedEgressResources: vi.fn(async <T>(fn: () => Promise<T>) => fn()),
  };
});
vi.mock("../controllers/istio/ambient-waypoint", () => {
  const mockUnregisterAmbientPackage = vi.fn();
  return {
    unregisterAmbientPackage: mockUnregisterAmbientPackage,
    __esModule: true,
    mockUnregisterAmbientPackage,
  };
});
vi.mock("../controllers/istio/virtual-service");
vi.mock("../controllers/network/policies");
vi.mock("pepr", () => ({
  K8s: vi.fn(),
  Log: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    trace: vi.fn(),
    child: vi.fn().mockReturnThis(),
  },
  kind: { CoreEvent: "CoreEvent" },
  Capability: vi.fn().mockImplementation(() => ({
    name: "uds-core-operator",
    description: "The UDS Operator is responsible for managing the lifecycle of UDS resources",
  })),
}));

// ---- Imports that depend on mocks ----
import { K8s, Log } from "pepr";
import { writeEvent } from ".";
import { reconcileSharedEgressResources } from "../controllers/istio/egress";
import { cleanupNamespace } from "../controllers/istio/namespace";
import { purgeAuthserviceClients } from "../controllers/keycloak/authservice/authservice";
import { purgeSSOClients } from "../controllers/keycloak/client-sync";
import { retryWithDelay } from "../controllers/utils";
import { Phase, UDSPackage } from "../crd";
import { packageFinalizer, packageReconciler, withBackoffIfNeeded } from "./package-reconciler";

const mockCleanupNamespace: MockedFunction<() => Promise<void>> = vi.fn();
const mockPurgeSSO: MockedFunction<() => Promise<void>> = vi.fn();
const mockPurgeAuthservice: MockedFunction<() => Promise<void>> = vi.fn();
const mockPatchStatus: MockedFunction<() => Promise<void>> = vi.fn();
const mockReconcileSharedEgressResources: MockedFunction<() => Promise<void>> = vi.fn();
const mockWriteEvent = vi.fn();
const mockUnregisterAmbientPackage: MockedFunction<() => Promise<void>> = vi.fn();

vi.mock("kubernetes-fluent-client");
vi.mock("../../config");
vi.mock("../controllers/istio/namespace", () => ({ cleanupNamespace: vi.fn() }));
vi.mock("../controllers/keycloak/client-sync", () => ({ purgeSSOClients: vi.fn() }));
vi.mock("../controllers/keycloak/authservice/authservice", () => ({
  purgeAuthserviceClients: vi.fn(),
}));
vi.mock("../controllers/utils", () => ({
  retryWithDelay: vi.fn(async <T>(fn: () => Promise<T>) => fn()),
}));
vi.mock(".", async () => {
  const originalModule = (await vi.importActual(".")) as object;
  return { ...originalModule, writeEvent: vi.fn() };
});
vi.mock("../controllers/istio/egress", async () => {
  const originalModule = (await vi.importActual("../controllers/istio/egress")) as object;
  return {
    ...originalModule,
    reconcileSharedEgressResources: vi.fn(async <T>(fn: () => Promise<T>) => fn()),
  };
});
vi.mock("../controllers/istio/ambient-waypoint", () => {
  const mockUnregisterAmbientPackage = vi.fn();
  return {
    unregisterAmbientPackage: mockUnregisterAmbientPackage,
    __esModule: true,
    mockUnregisterAmbientPackage,
  };
});
vi.mock("../controllers/istio/virtual-service");
vi.mock("../controllers/network/policies");
vi.mock("pepr", () => ({
  K8s: vi.fn(),
  Log: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    trace: vi.fn(),
    child: vi.fn().mockReturnThis(),
  },
  kind: { CoreEvent: "CoreEvent" },
  Capability: vi.fn().mockImplementation(() => ({
    name: "uds-core-operator",
    description: "The UDS Operator is responsible for managing the lifecycle of UDS resources",
  })),
}));

describe("withBackoffIfNeeded", () => {
  let mockPackage: UDSPackage;
  let mockFn: Mock;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    mockPackage = {
      metadata: { name: "test-pkg", namespace: "test-ns" },
      status: { phase: Phase.Pending },
    };

    mockFn = vi.fn().mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("should not delay when retryAttempt is 0", async () => {
    mockPackage.status = { phase: Phase.Pending, retryAttempt: 0 };

    await withBackoffIfNeeded(mockPackage, mockFn);

    expect(mockFn).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0); // No timers should be set
  });

  test("should not delay when retryAttempt is undefined", async () => {
    mockPackage.status = { phase: Phase.Pending };

    await withBackoffIfNeeded(mockPackage, mockFn);

    expect(mockFn).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  test("should delay with exponential backoff based on retryAttempt", async () => {
    // Mock the timer functions
    vi.useFakeTimers();

    const testCases = [
      { retryAttempt: 1, expectedDelay: 3000 }, // 3^1 = 3s
      { retryAttempt: 2, expectedDelay: 9000 }, // 3^2 = 9s
      { retryAttempt: 3, expectedDelay: 27000 }, // 3^3 = 27s
      { retryAttempt: 4, expectedDelay: 81000 }, // 3^4 = 81s
    ];

    for (const { retryAttempt, expectedDelay } of testCases) {
      vi.clearAllMocks();
      mockPackage.status = { phase: Phase.Pending, retryAttempt };

      // Spy on the mock function
      const mockFnSpy = vi.fn().mockResolvedValue(undefined);

      // Call the function
      const promise = withBackoffIfNeeded(mockPackage, mockFnSpy);

      // Fast-forward time
      await vi.advanceTimersByTimeAsync(expectedDelay);
      await promise;

      // Verify the function was called after the delay
      expect(mockFnSpy).toHaveBeenCalledTimes(1);

      // Verify the log message
      expect(Log.info).toHaveBeenCalledWith(
        mockPackage.metadata,
        `Waiting ${expectedDelay / 1000} seconds before processing package ${mockPackage.metadata?.namespace}/${mockPackage.metadata?.name}`,
      );

      // Verify the event was written
      expect(writeEvent).toHaveBeenCalledWith(mockPackage, {
        message: `Waiting ${expectedDelay / 1000} seconds before retrying package`,
      });
    }

    // Restore real timers
    vi.useRealTimers();
  });

  test("should call the provided function after delay", async () => {
    // Mock the timer functions
    vi.useFakeTimers();

    try {
      mockPackage.status = { phase: Phase.Pending, retryAttempt: 1 };
      const testResult = { success: true };

      // Create a mock function that returns our test result
      const mockFnWithResult = vi.fn().mockResolvedValue(testResult);

      // Call the function
      const resultPromise = withBackoffIfNeeded(mockPackage, mockFnWithResult);

      // Fast-forward past the delay
      await vi.advanceTimersByTimeAsync(3000);
      const result = await resultPromise;

      // Verify the function was called and the result is correct
      expect(mockFnWithResult).toHaveBeenCalledTimes(1);
      expect(result).toEqual(testResult);
    } finally {
      // Restore real timers
      vi.useRealTimers();
    }
  });
});

describe("packageReconciler", () => {
  let mockPackage: UDSPackage;
  beforeEach(() => {
    vi.clearAllMocks();
    mockPackage = {
      metadata: { name: "test-package", namespace: "test-namespace", generation: 1 },
      status: { phase: Phase.Pending, observedGeneration: 0 },
    };
    (K8s as Mock).mockImplementation(() => ({ Create: vi.fn(), PatchStatus: vi.fn() }));
  });
  test("logs error for invalid package definitions", async () => {
    delete mockPackage.metadata!.namespace;
    await packageReconciler(mockPackage);
    expect(Log.error).toHaveBeenCalled();
  });
});

describe("packageFinalizer", () => {
  let mockPackage: UDSPackage;
  beforeEach(() => {
    vi.clearAllMocks();

    mockPackage = {
      metadata: { name: "test-package", namespace: "test-namespace", generation: 1 },
      spec: {
        sso: [
          {
            name: "test-sso",
            clientId: "test-client",
            enableAuthserviceSelector: { enabled: "true" },
          },
        ],
      },
    };

    mockCleanupNamespace.mockReset().mockResolvedValue(undefined);
    mockPurgeSSO.mockReset().mockResolvedValue(undefined);
    mockPurgeAuthservice.mockReset().mockResolvedValue(undefined);
    mockPatchStatus.mockReset().mockResolvedValue(undefined);
    mockReconcileSharedEgressResources.mockReset().mockResolvedValue(undefined);
    mockUnregisterAmbientPackage.mockReset().mockResolvedValue(undefined);
    mockWriteEvent.mockReset();
    (K8s as Mock).mockImplementation(() => ({
      Create: vi.fn(),
      PatchStatus: mockPatchStatus,
    }));
    (cleanupNamespace as Mock).mockImplementation(mockCleanupNamespace);
    (purgeSSOClients as Mock).mockImplementation(mockPurgeSSO);
    (purgeAuthserviceClients as Mock).mockImplementation(mockPurgeAuthservice);
    (reconcileSharedEgressResources as Mock).mockImplementation(mockReconcileSharedEgressResources);
    (writeEvent as Mock).mockImplementation(mockWriteEvent);
  });

  test("should not remove the finalizer for pending packages", async () => {
    mockPackage.status = { phase: Phase.Pending };
    const finalizerRemoved = await packageFinalizer(mockPackage);
    // Assert that we didn't try to cleanup anything
    expect(retryWithDelay).not.toHaveBeenCalled();
    expect(mockCleanupNamespace).not.toHaveBeenCalled();
    expect(mockPurgeSSO).not.toHaveBeenCalled();
    expect(mockPurgeAuthservice).not.toHaveBeenCalled();
    // Assert that the finalizer was not removed
    expect(finalizerRemoved).toEqual(false);
  });

  test("should not remove the finalizer for removing packages", async () => {
    mockPackage.status = { phase: Phase.Removing };
    const finalizerRemoved = await packageFinalizer(mockPackage);
    // Assert that we didn't try to cleanup anything
    expect(retryWithDelay).not.toHaveBeenCalled();
    expect(mockCleanupNamespace).not.toHaveBeenCalled();
    expect(mockPurgeSSO).not.toHaveBeenCalled();
    expect(mockPurgeAuthservice).not.toHaveBeenCalled();
    // Assert that the finalizer was not removed
    expect(finalizerRemoved).toEqual(false);
  });

  test("should not remove the finalizer for removalfailed packages", async () => {
    mockPackage.status = { phase: Phase.RemovalFailed };
    const finalizerRemoved = await packageFinalizer(mockPackage);
    // Assert that we didn't try to cleanup anything
    expect(retryWithDelay).not.toHaveBeenCalled();
    expect(mockCleanupNamespace).not.toHaveBeenCalled();
    expect(mockPurgeSSO).not.toHaveBeenCalled();
    expect(mockPurgeAuthservice).not.toHaveBeenCalled();
    // Assert that the finalizer was not removed
    expect(finalizerRemoved).toEqual(false);
  });

  test("should finalize a ready package", async () => {
    mockPackage.status = { phase: Phase.Ready };
    const finalizerRemoved = await packageFinalizer(mockPackage);
    expect(finalizerRemoved).toEqual(true);
    expect(retryWithDelay).toHaveBeenCalled();
    expect(mockCleanupNamespace).toHaveBeenCalled();
    expect(mockPurgeSSO).toHaveBeenCalled();
    expect(mockPurgeAuthservice).toHaveBeenCalled();
    expect(mockReconcileSharedEgressResources).toHaveBeenCalled();
  });

  test("should handle failure in cleanupNamespace and set phase to RemovalFailed", async () => {
    mockPackage.status = { phase: Phase.Ready };
    mockCleanupNamespace.mockRejectedValue(new Error("Istio cleanup failed"));
    mockPurgeAuthservice.mockReset();
    mockPurgeSSO.mockReset();
    mockReconcileSharedEgressResources.mockReset();

    const finalizerRemoved = await packageFinalizer(mockPackage);

    expect(finalizerRemoved).toEqual(false);
    expect(retryWithDelay).toHaveBeenCalled();
    expect(mockCleanupNamespace).toHaveBeenCalled();
    expect(mockPatchStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: { name: "test-package", namespace: "test-namespace" },
        status: { phase: Phase.RemovalFailed },
      }),
    );
    expect(mockWriteEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        reason: "RemovalFailed",
        message: expect.stringContaining("Istio"),
      }),
    );
  });

  test("should handle failure in purgeAuthserviceClients and set phase to RemovalFailed", async () => {
    mockPackage.status = { phase: Phase.Ready };
    mockCleanupNamespace.mockReset();
    mockPurgeAuthservice.mockRejectedValue(new Error("AuthService cleanup failed"));
    mockPurgeSSO.mockReset();
    mockReconcileSharedEgressResources.mockReset();

    const finalizerRemoved = await packageFinalizer(mockPackage);

    expect(finalizerRemoved).toEqual(false);
    expect(retryWithDelay).toHaveBeenCalled();
    expect(mockCleanupNamespace).toHaveBeenCalled();
    expect(mockPurgeAuthservice).toHaveBeenCalled();
    expect(mockPatchStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: { name: "test-package", namespace: "test-namespace" },
        status: { phase: Phase.RemovalFailed },
      }),
    );
    expect(mockWriteEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        reason: "RemovalFailed",
        message: expect.stringContaining("AuthService"),
      }),
    );
  });

  test("should handle failure in purgeSSOClients and set phase to RemovalFailed", async () => {
    mockPackage.status = { phase: Phase.Ready };
    mockCleanupNamespace.mockReset();
    mockPurgeAuthservice.mockReset();
    mockPurgeSSO.mockRejectedValue(new Error("SSO cleanup failed"));
    mockReconcileSharedEgressResources.mockReset();

    const finalizerRemoved = await packageFinalizer(mockPackage);

    expect(finalizerRemoved).toEqual(false);
    expect(retryWithDelay).toHaveBeenCalled();
    expect(mockCleanupNamespace).toHaveBeenCalled();
    expect(mockPurgeAuthservice).toHaveBeenCalled();
    expect(mockPurgeSSO).toHaveBeenCalled();
    expect(mockPatchStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: { name: "test-package", namespace: "test-namespace" },
        status: { phase: Phase.RemovalFailed },
      }),
    );
    expect(mockWriteEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        reason: "RemovalFailed",
        message: expect.stringContaining("SSO"),
      }),
    );
  });

  test("should handle failure in reconcileSharedEgressResources and set phase to RemovalFailed", async () => {
    mockPackage.status = { phase: Phase.Ready };
    mockCleanupNamespace.mockReset().mockResolvedValue(undefined);
    mockPurgeAuthservice.mockReset().mockResolvedValue(undefined);
    mockPurgeSSO.mockReset().mockResolvedValue(undefined);
    mockReconcileSharedEgressResources
      .mockReset()
      .mockRejectedValue(new Error("Egress cleanup failed"));

    // Always resolve unregisterAmbientPackage
    mockUnregisterAmbientPackage.mockReset().mockResolvedValue(undefined);

    const finalizerRemoved = await packageFinalizer(mockPackage);

    expect(finalizerRemoved).toEqual(false);
    expect(retryWithDelay).toHaveBeenCalled();
    expect(mockCleanupNamespace).toHaveBeenCalled();
    expect(mockPurgeAuthservice).toHaveBeenCalled();
    expect(mockPurgeSSO).toHaveBeenCalled();
    expect(mockReconcileSharedEgressResources).toHaveBeenCalled();
    expect(mockPatchStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: { name: "test-package", namespace: "test-namespace" },
        status: { phase: Phase.RemovalFailed },
      }),
    );
    expect(mockWriteEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        reason: "RemovalFailed",
        message: expect.stringContaining("Egress"),
      }),
    );
  });
});
