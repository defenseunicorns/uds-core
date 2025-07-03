/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { K8s, kind } from "pepr";
import { Logger } from "pino";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as utils from "./utils";
import { evictPods, retryWithDelay } from "./utils";

// Mock K8s client
vi.mock("pepr", () => {
  const actualKind = {
    Pod: "Pod",
    Deployment: "Deployment",
    ReplicaSet: "ReplicaSet",
    StatefulSet: "StatefulSet",
    DaemonSet: "DaemonSet",
  };

  return {
    K8s: vi.fn(),
    kind: actualKind,
  };
});

// No need to mock the internal functions - we'll use spies instead

describe("retryWithDelay", () => {
  let mockLogger: Logger;

  beforeEach(() => {
    mockLogger = {
      warn: vi.fn(),
      level: "info",
      fatal: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      debug: vi.fn(),
      trace: vi.fn(),
    } as unknown as Logger;
  });

  beforeEach(() => {});

  it("should succeed on the first attempt", async () => {
    const mockFn = vi.fn<() => Promise<string>>().mockResolvedValue("Success");

    const result = await retryWithDelay(mockFn, mockLogger);

    expect(result).toBe("Success");
    expect(mockFn).toHaveBeenCalledTimes(1); // Called only once
    expect(mockLogger.warn).not.toHaveBeenCalled(); // No warnings logged
  });

  it("should retry on failure and eventually succeed", async () => {
    const mockFn = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("Fail on 1st try")) // Fail first attempt
      .mockResolvedValue("Success"); // Succeed on retry

    const result = await retryWithDelay(mockFn, mockLogger, 3, 100);

    expect(result).toBe("Success");
    expect(mockFn).toHaveBeenCalledTimes(2); // Called twice (1 fail + 1 success)
    expect(mockLogger.warn).toHaveBeenCalledTimes(1); // Warned once for the retry
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining("Attempt 1 of spy failed, retrying in 100ms."),
      expect.objectContaining({ error: expect.any(String) }),
    );
  });

  it("should retry when function rejects without an error", async () => {
    const mockFn = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(undefined) // Rejected with no error
      .mockResolvedValue("Success"); // Succeed on retry

    const result = await retryWithDelay(mockFn, mockLogger, 3, 100);

    expect(result).toBe("Success");
    expect(mockFn).toHaveBeenCalledTimes(2); // Called twice (1 fail + 1 success)
    expect(mockLogger.warn).toHaveBeenCalledTimes(1);
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining("Attempt 1 of spy failed, retrying in 100ms."),
      expect.objectContaining({ error: "Unknown Error" }),
    );
  });

  it("should throw the original error after max retries", async () => {
    const error = new Error("Persistent failure");
    const mockFn = vi.fn<() => Promise<string>>().mockRejectedValue(error); // Always fails

    await expect(retryWithDelay(mockFn, mockLogger, 3, 100)).rejects.toThrow("Persistent failure");

    expect(mockFn).toHaveBeenCalledTimes(3); // Retries up to the limit
    expect(mockLogger.warn).toHaveBeenCalledTimes(2); // Logged for each failure except the final one
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining("Attempt 1 of spy failed, retrying in 100ms."),
      expect.objectContaining({ error: error.message }),
    );
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining("Attempt 2 of spy failed, retrying in 100ms."),
      expect.objectContaining({ error: error.message }),
    );
  });
});

describe("evictPods", () => {
  let mockLogger: Logger;

  // Mock K8s client operations
  const mockWithName = vi.fn().mockReturnThis();
  const mockInNamespace = vi.fn().mockReturnThis();
  const mockGet = vi.fn();
  const mockEvict = vi.fn();
  const mockApply = vi.fn();
  const mockDelete = vi.fn();
  const mockPatch = vi.fn();
  const mockCreate = vi.fn();

  beforeEach(() => {
    vi.resetAllMocks();

    // Setup logger mock
    mockLogger = {
      warn: vi.fn(),
      level: "info",
      fatal: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      debug: vi.fn(),
      trace: vi.fn(),
    } as unknown as Logger;

    // Setup K8s mock with chainable methods
    mockWithName.mockImplementation(() => ({
      Get: mockGet,
      Evict: mockEvict,
      Apply: mockApply,
      Delete: mockDelete,
    }));

    mockInNamespace.mockImplementation(() => ({
      WithName: mockWithName,
      Get: mockGet,
      Apply: mockApply,
      Patch: mockPatch,
    }));

    // Configure the main K8s mock with all required methods
    vi.mocked(K8s).mockImplementation(() => ({
      InNamespace: mockInNamespace,
      Apply: mockApply,
      Delete: mockDelete,
      Get: mockGet,
      Evict: mockEvict,
      Patch: mockPatch,
      Watch: vi.fn(),
      Logs: vi.fn(),
      WithField: vi.fn().mockReturnThis(),
      WithLabel: vi.fn().mockReturnThis(),
      Create: mockCreate,
      PatchStatus: vi.fn(),
      Raw: vi.fn(),
    }));

    // Default successful responses
    mockGet.mockResolvedValue({ items: [] });
    mockEvict.mockResolvedValue({ status: "Success" });
    mockApply.mockResolvedValue({ status: "Success" });
    mockDelete.mockResolvedValue({ status: "Success" });

    // Reset the evictPods helper spy
    vi.spyOn(utils, "evictPods").mockClear();
  });

  it("should handle empty pod lists", async () => {
    await evictPods("default", [], "Test reason", mockLogger);
    expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining("No pods"));
  });

  it("should directly evict standalone pods", async () => {
    // Pod without any owner reference
    const pods = [
      {
        metadata: {
          name: "standalone-pod",
          namespace: "default",
        },
      },
    ];

    // Setup the namespace chain for pod eviction
    mockInNamespace.mockImplementation(() => ({
      WithName: mockWithName,
      Evict: mockEvict,
      WithLabel: vi.fn().mockReturnThis(),
      Get: mockGet,
      Apply: mockApply,
    }));

    await evictPods("default", pods as kind.Pod[], "Test eviction", mockLogger);

    // The standalone pod should be evicted
    expect(mockEvict).toHaveBeenCalled();
  });

  it("should restart StatefulSets by patching with annotation", async () => {
    // Pod owned by a StatefulSet
    const pods = [
      {
        metadata: {
          name: "statefulset-pod-0",
          namespace: "default",
          ownerReferences: [
            {
              kind: "StatefulSet",
              name: "test-statefulset",
              apiVersion: "apps/v1",
              controller: true,
            },
          ],
        },
      },
    ];

    // Mock StatefulSet get response
    mockGet.mockResolvedValueOnce({
      metadata: { name: "test-statefulset", namespace: "default", uid: "test-uid" },
      apiVersion: "apps/v1",
      kind: "StatefulSet",
      spec: { template: { metadata: { annotations: {} } } },
    });

    await evictPods("default", pods as kind.Pod[], "Test eviction", mockLogger);

    // Should patch the StatefulSet with restart annotation
    expect(mockPatch).toHaveBeenCalledWith([
      expect.objectContaining({
        op: "add",
        path: "/spec/template/metadata/annotations/uds.dev~1restartedAt",
        value: expect.any(String),
      }),
    ]);

    // Should create an event for the controller restart
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "Normal",
        reason: "SecretChanged",
        message: "Restarted due to: Test eviction",
        involvedObject: expect.objectContaining({
          kind: "StatefulSet",
          name: "test-statefulset",
          namespace: "default",
          // uid might be undefined in tests depending on mock implementation
        }),
      }),
    );
  });

  it("should restart Deployments when pods are owned by ReplicaSets", async () => {
    // Pod owned by a ReplicaSet
    const pods = [
      {
        metadata: {
          name: "deployment-pod",
          namespace: "default",
          ownerReferences: [
            {
              kind: "ReplicaSet",
              name: "test-replicaset",
              apiVersion: "apps/v1",
              controller: true,
            },
          ],
        },
      },
    ];

    // Mock ReplicaSet with Deployment owner
    mockGet.mockResolvedValueOnce({
      metadata: {
        name: "test-replicaset",
        ownerReferences: [
          {
            kind: "Deployment",
            name: "test-deployment",
            apiVersion: "apps/v1",
            controller: true,
          },
        ],
      },
    });

    // Mock Deployment
    mockGet.mockResolvedValueOnce({
      metadata: { name: "test-deployment", namespace: "default", uid: "deployment-uid" },
      apiVersion: "apps/v1",
      kind: "Deployment",
      spec: { template: { metadata: { annotations: {} } } },
    });

    await evictPods("default", pods as kind.Pod[], "Test eviction", mockLogger);

    // Should patch the Deployment with restart annotation
    expect(mockPatch).toHaveBeenCalledWith([
      expect.objectContaining({
        op: "add",
        path: "/spec/template/metadata/annotations/uds.dev~1restartedAt",
        value: expect.any(String),
      }),
    ]);

    // Should create an event for the controller restart
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "Normal",
        reason: "SecretChanged",
        message: "Restarted due to: Test eviction",
        involvedObject: expect.objectContaining({
          kind: "Deployment",
          name: "test-deployment",
          namespace: "default",
          // uid might be undefined in tests depending on mock implementation
        }),
      }),
    );
  });

  it("should restart orphaned ReplicaSets when no Deployment owner", async () => {
    // Pod owned by a ReplicaSet without Deployment owner
    const pods = [
      {
        metadata: {
          name: "replicaset-pod",
          namespace: "default",
          ownerReferences: [
            {
              kind: "ReplicaSet",
              name: "standalone-replicaset",
              apiVersion: "apps/v1",
              controller: true,
            },
          ],
        },
      },
    ];

    // Mock ReplicaSet with no owner
    mockGet.mockResolvedValue({
      metadata: { name: "standalone-replicaset", namespace: "default", uid: "replicaset-uid" },
      apiVersion: "apps/v1",
      kind: "ReplicaSet",
      spec: { template: { metadata: { annotations: {} } } },
    });

    await evictPods("default", pods as kind.Pod[], "Test eviction", mockLogger);

    // Should patch the ReplicaSet directly with restart annotation
    expect(mockPatch).toHaveBeenCalledWith([
      expect.objectContaining({
        op: "add",
        path: "/spec/template/metadata/annotations/uds.dev~1restartedAt",
        value: expect.any(String),
      }),
    ]);

    // Should create an event for the ReplicaSet restart
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "Normal",
        reason: "SecretChanged",
        message: "Restarted due to: Test eviction",
        involvedObject: expect.objectContaining({
          kind: "ReplicaSet",
          name: "standalone-replicaset",
          namespace: "default",
          // uid might be undefined in tests depending on mock implementation
        }),
      }),
    );
  });

  it("should fall back to direct pod eviction if controller patching fails", async () => {
    // Create a statefulset-controlled pod
    const pods = [
      {
        metadata: {
          name: "statefulset-pod-0",
          namespace: "default",
          ownerReferences: [
            {
              kind: "StatefulSet",
              name: "test-statefulset",
              apiVersion: "apps/v1",
              controller: true,
            },
          ],
        },
      },
    ];

    // Reset all mocks before test
    vi.resetAllMocks();

    // Set up the K8s mock to handle different resources
    const mockStatefulSetClient = {
      InNamespace: vi.fn().mockReturnValue({
        Get: vi.fn().mockResolvedValue({
          metadata: { name: "test-statefulset" },
          spec: { template: { metadata: { annotations: {} } } },
        }),
        Patch: mockPatch, // This will be rejected below
      }),
      Patch: mockPatch, // Also provide at this level for flexibility
    };

    const mockPodClient = {
      InNamespace: vi.fn().mockReturnValue({
        WithName: vi.fn().mockReturnValue({
          Evict: vi.fn().mockResolvedValue({}), // Successfully evict the pod
        }),
      }),
    };

    // Fail the Patch call to trigger fallback path
    mockPatch.mockRejectedValueOnce(new Error("Failed to patch controller"));

    // Setup K8s mock to handle different resource types with proper types
    const mockK8sImplementation = (resourceKind: typeof kind.StatefulSet | typeof kind.Pod) => {
      if (resourceKind === kind.StatefulSet) {
        return mockStatefulSetClient;
      } else if (resourceKind === kind.Pod) {
        return mockPodClient;
      }
      return {
        InNamespace: vi.fn().mockReturnThis(),
        Apply: vi.fn(),
        Get: vi.fn(),
        Patch: vi.fn(),
      };
    };

    // Use unknown first, then cast to the expected K8s function type
    vi.mocked(K8s).mockImplementation(mockK8sImplementation as unknown as typeof K8s);

    // Execute the function under test
    await evictPods("default", pods as kind.Pod[], "Test eviction", mockLogger);

    // Verify Patch was called and errored
    expect(mockPatch).toHaveBeenCalledWith([
      expect.objectContaining({
        op: "add",
        path: "/spec/template/metadata/annotations/uds.dev~1restartedAt",
        value: expect.any(String),
      }),
    ]);

    // Verify error was logged with correct controller info
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        controller: "StatefulSet",
        controllerName: "test-statefulset",
      }),
      expect.stringContaining("Failed to handle controller for pod"),
    );

    // Verify pod eviction client was accessed
    expect(mockPodClient.InNamespace).toHaveBeenCalledWith("default");

    // Verify the fallback path logged the right message
    expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining("Directly evicting"));
  });
});
