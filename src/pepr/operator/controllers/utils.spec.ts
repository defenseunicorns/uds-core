/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { GenericClass } from "kubernetes-fluent-client";
import { K8s, kind } from "pepr";
import { Logger } from "pino";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as utils from "./utils";
import { createEvent, reloadPods, restartController, retryWithDelay } from "./utils";

// Mock K8s client
vi.mock("pepr", () => {
  const actualKind = {
    Pod: "Pod",
    Deployment: "Deployment",
    ReplicaSet: "ReplicaSet",
    StatefulSet: "StatefulSet",
    DaemonSet: "DaemonSet",
    CoreEvent: "CoreEvent",
  };

  return {
    K8s: vi.fn(),
    kind: actualKind,
  };
});

// Helper function to create a mock Pino logger
function createMockLogger(overrides = {}) {
  return {
    level: "info",
    fatal: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    // Override with any custom implementations
    ...overrides,
  } as unknown as Logger;
}

// Helper function to create a mock K8s client with all required methods
function createMockK8sClient(overrides = {}) {
  return {
    // Core methods
    Create: vi.fn().mockResolvedValue({}),
    Logs: vi.fn().mockResolvedValue({}),
    Get: vi.fn().mockResolvedValue({}),
    Delete: vi.fn().mockResolvedValue({}),
    Evict: vi.fn().mockResolvedValue({}),
    Watch: vi.fn().mockResolvedValue({}),
    Apply: vi.fn().mockResolvedValue({}),
    Patch: vi.fn().mockResolvedValue({}),
    PatchStatus: vi.fn().mockResolvedValue({}),
    Raw: vi.fn().mockResolvedValue({}),
    Proxy: vi.fn().mockResolvedValue({}),

    // Fluent API methods
    WithField: vi.fn().mockReturnThis(),
    InNamespace: vi.fn().mockReturnThis(),
    WithLabel: vi.fn().mockReturnThis(),

    // Apply any custom overrides
    ...overrides,
  };
}

describe("retryWithDelay", () => {
  let mockLogger: Logger;

  beforeEach(() => {
    mockLogger = createMockLogger();
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

describe("reloadPods", () => {
  let mockLogger: Logger;
  let mockK8sClient: ReturnType<typeof createMockK8sClient>;

  // Track which controller kinds are used with K8s
  let lastUsedControllerKind: GenericClass | null = null;
  let lastControllerName: string = "";

  beforeEach(() => {
    vi.resetAllMocks();

    // Setup logger mock
    mockLogger = createMockLogger();

    // Create a mock K8s client with default responses
    mockK8sClient = createMockK8sClient();

    // Reset the reloadPods helper spy
    vi.spyOn(utils, "reloadPods").mockClear();

    // Reset tracking variables
    lastUsedControllerKind = null;
    lastControllerName = "";

    // Configure the main K8s mock
    vi.mocked(K8s).mockImplementation(
      (resourceKind: GenericClass, options?: { name?: string; namespace?: string }) => {
        // Track the controller kind and name when a specific controller is targeted
        if (options?.name) {
          lastUsedControllerKind = resourceKind;
          lastControllerName = options.name;
        }
        return mockK8sClient;
      },
    );
  });

  it("should handle empty pod lists", async () => {
    await reloadPods("default", [], "Test reason", mockLogger);
    expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining("No pods"));
  });

  it("should directly evict standalone pods", async () => {
    // Pod without any owner reference
    const podName = "standalone-pod";
    const pods = [
      {
        metadata: {
          name: podName,
          namespace: "default",
        },
      },
    ];

    await reloadPods("default", pods as kind.Pod[], "Test eviction", mockLogger);

    // The standalone pod should be evicted
    expect(mockK8sClient.Evict).toHaveBeenCalledWith(podName);
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
    mockK8sClient.Get.mockResolvedValueOnce({
      metadata: { name: "test-statefulset", namespace: "default", uid: "test-uid" },
      apiVersion: "apps/v1",
      kind: "StatefulSet",
      spec: { template: { metadata: { annotations: {} } } },
    });

    await reloadPods("default", pods as kind.Pod[], "Test eviction", mockLogger);

    // Should patch the StatefulSet with restart annotation
    expect(mockK8sClient.Patch).toHaveBeenCalledWith([
      expect.objectContaining({
        op: "add",
        path: "/spec/template/metadata/annotations/uds.dev~1restartedAt",
        value: expect.any(String),
      }),
    ]);

    // Verify the correct controller kind was used
    expect(lastUsedControllerKind).toBe(kind.StatefulSet);
    expect(lastControllerName).toBe("test-statefulset");

    // Should create an event for the controller restart
    expect(mockK8sClient.Create).toHaveBeenCalledWith(
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
    mockK8sClient.Get.mockResolvedValueOnce({
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
    mockK8sClient.Get.mockResolvedValueOnce({
      metadata: { name: "test-deployment", namespace: "default", uid: "deployment-uid" },
      apiVersion: "apps/v1",
      kind: "Deployment",
      spec: { template: { metadata: { annotations: {} } } },
    });

    await reloadPods("default", pods as kind.Pod[], "Test eviction", mockLogger);

    // Should patch the Deployment with restart annotation
    expect(mockK8sClient.Patch).toHaveBeenCalledWith([
      expect.objectContaining({
        op: "add",
        path: "/spec/template/metadata/annotations/uds.dev~1restartedAt",
        value: expect.any(String),
      }),
    ]);

    // Verify the correct controller kind was used
    expect(lastUsedControllerKind).toBe(kind.Deployment);
    expect(lastControllerName).toBe("test-deployment");

    // Should create an event for the controller restart
    expect(mockK8sClient.Create).toHaveBeenCalledWith(
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
    mockK8sClient.Get.mockResolvedValue({
      metadata: { name: "standalone-replicaset", namespace: "default", uid: "replicaset-uid" },
      apiVersion: "apps/v1",
      kind: "ReplicaSet",
      spec: { template: { metadata: { annotations: {} } } },
    });

    await reloadPods("default", pods as kind.Pod[], "Test eviction", mockLogger);

    // Should patch the ReplicaSet directly with restart annotation
    expect(mockK8sClient.Patch).toHaveBeenCalledWith([
      expect.objectContaining({
        op: "add",
        path: "/spec/template/metadata/annotations/uds.dev~1restartedAt",
        value: expect.any(String),
      }),
    ]);

    // Verify the correct controller kind was used
    expect(lastUsedControllerKind).toBe(kind.ReplicaSet);
    expect(lastControllerName).toBe("standalone-replicaset");

    // Should create an event for the ReplicaSet restart
    expect(mockK8sClient.Create).toHaveBeenCalledWith(
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

  it("should log an error if controller patching fails but not attempt pod eviction", async () => {
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

    // Configure mockK8sClient for this test
    mockK8sClient.Get.mockResolvedValueOnce({
      metadata: { name: "test-statefulset" },
      spec: { template: { metadata: { annotations: {} } } },
    });

    // Fail the Patch call to trigger fallback path
    mockK8sClient.Patch.mockRejectedValueOnce(new Error("Failed to patch controller"));

    // Configure successful pod eviction
    mockK8sClient.Evict.mockResolvedValue({});

    // Set up K8s mock to return our mockK8sClient
    vi.mocked(K8s).mockImplementation((resourceKind, options) => {
      // Track the controller kind and name when a specific controller is targeted
      if (options?.name) {
        lastUsedControllerKind = resourceKind;
        lastControllerName = options.name;
      }
      return mockK8sClient;
    });

    // Execute the function under test
    await reloadPods("default", pods as kind.Pod[], "Test eviction", mockLogger);

    // Verify Patch was called and errored
    expect(mockK8sClient.Patch).toHaveBeenCalledWith([
      expect.objectContaining({
        op: "add",
        path: "/spec/template/metadata/annotations/uds.dev~1restartedAt",
        value: expect.any(String),
      }),
    ]);

    // Verify the correct controller kind was used
    expect(lastUsedControllerKind).toBe(kind.StatefulSet);
    expect(lastControllerName).toBe("test-statefulset");

    // Verify error was logged with correct controller info
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        controller: "StatefulSet",
        controllerName: "test-statefulset",
      }),
      expect.stringContaining("Failed to handle controller for pod"),
    );

    // Verify pod eviction was NOT attempted
    expect(mockK8sClient.InNamespace).not.toHaveBeenCalled();
    expect(mockK8sClient.Evict).not.toHaveBeenCalled();
  });
});

describe("createEvent", () => {
  // Save original environment
  const originalEnv = process.env;
  let mockLogger: Logger;
  let mockK8sClient: ReturnType<typeof createMockK8sClient>;

  beforeEach(() => {
    // Reset mocks
    vi.resetAllMocks();

    // Setup environment variables
    process.env = { ...originalEnv, HOSTNAME: "test-host" };

    // Setup logger mock
    mockLogger = createMockLogger();

    // Create a mock K8s client
    mockK8sClient = createMockK8sClient();
  });

  afterEach(() => {
    // Restore environment
    process.env = originalEnv;
  });

  it("should create an event for a valid resource", async () => {
    // Set up K8s mocks
    vi.mocked(K8s).mockReturnValue(mockK8sClient);

    // Create a test resource
    const resource = {
      apiVersion: "v1",
      kind: "Pod",
      metadata: {
        name: "test-pod",
        namespace: "test-ns",
        uid: "test-uid",
      },
    };

    // Call the function
    await createEvent(
      resource,
      {
        reason: "TestReason",
        message: "Test message",
      },
      mockLogger,
    );

    // Verify K8s was called with CoreEvent
    expect(K8s).toHaveBeenCalledWith(kind.CoreEvent);

    // Verify Create was called with the correct event data
    expect(mockK8sClient.Create).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "Normal",
        reason: "TestReason",
        message: "Test message",
        metadata: {
          namespace: "test-ns",
          generateName: "test-pod",
        },
        involvedObject: {
          apiVersion: "v1",
          kind: "Pod",
          name: "test-pod",
          namespace: "test-ns",
          uid: "test-uid",
        },
        reportingComponent: "uds.dev/operator",
        reportingInstance: "test-host",
      }),
    );
  });

  it("should throw errors when event creation fails", async () => {
    // Mock K8s Create function to throw an error
    const mockCreate = vi.fn().mockRejectedValue(new Error("Test error"));

    // Set up K8s mocks
    vi.mocked(K8s).mockReturnValue(
      createMockK8sClient({
        Create: mockCreate,
      }),
    );

    // Create a test resource
    const resource = {
      apiVersion: "v1",
      kind: "Pod",
      metadata: {
        name: "test-pod",
        namespace: "test-ns",
      },
    };

    // Call the function - should throw
    await expect(createEvent(resource, {}, mockLogger)).rejects.toThrow("Test error");
  });
});

describe("restartController", () => {
  let mockLogger: Logger;
  let mockK8sClient: ReturnType<typeof createMockK8sClient>;

  beforeEach(() => {
    // Reset mocks
    vi.resetAllMocks();

    // Setup logger mock
    mockLogger = createMockLogger();

    // Create a mock K8s client
    mockK8sClient = createMockK8sClient();
  });

  it("should restart a Deployment controller", async () => {
    // Configure mockK8sClient for this test
    mockK8sClient.Get.mockResolvedValue({
      apiVersion: "apps/v1",
      kind: "Deployment",
      spec: {
        template: {
          metadata: {
            annotations: {},
          },
        },
      },
      metadata: {
        name: "test-deployment",
        namespace: "test-ns",
      },
    });

    // Set up K8s mock to return our mockK8sClient
    vi.mocked(K8s).mockReturnValue(mockK8sClient);

    // Call the function
    await restartController(
      "test-ns",
      kind.Deployment,
      "test-deployment",
      "Secret changed",
      mockLogger,
    );

    // Verify Patch was called with the correct annotation
    expect(mockK8sClient.Patch).toHaveBeenCalledWith([
      {
        op: "add",
        path: "/spec/template/metadata/annotations/uds.dev~1restartedAt",
        value: expect.any(String),
      },
    ]);

    // Verify createEvent was called
    expect(mockK8sClient.Create).toHaveBeenCalled();

    // Verify the event has the correct properties
    const eventArg = mockK8sClient.Create.mock.calls[0][0];
    expect(eventArg).toMatchObject({
      involvedObject: {
        apiVersion: "apps/v1",
        kind: "Deployment",
        name: "test-deployment",
        namespace: "test-ns",
      },
      metadata: {
        generateName: "test-deployment",
        namespace: "test-ns",
      },
      message: "Restarted due to: Secret changed",
      reason: "SecretChanged",
      type: "Normal",
      reportingComponent: "uds.dev/operator",
    });

    // Verify firstTimestamp is a Date
    expect(eventArg.firstTimestamp).toBeInstanceOf(Date);

    // Verify logger was called
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        controller: "Deployment",
        name: "test-deployment",
        namespace: "test-ns",
      }),
      expect.stringContaining("Successfully restarted Deployment controller"),
    );
  });

  it("should throw an error for unsupported controller kinds", async () => {
    // Set up K8s mocks
    vi.mocked(K8s).mockReturnValue(createMockK8sClient());

    // Call the function and expect it to throw
    await expect(
      restartController("test-ns", {} as GenericClass, "test-name", "test-reason", mockLogger),
    ).rejects.toThrow("Unsupported controller kind");
  });

  it("should handle errors during controller restart", async () => {
    // Mock K8s Patch function to throw an error
    const mockPatch = vi.fn().mockRejectedValue(new Error("Test error"));

    // Set up K8s mocks with custom implementation
    vi.mocked(K8s).mockImplementation((resourceKind, options) => {
      if (options?.name && options?.namespace) {
        return createMockK8sClient({
          Patch: mockPatch,
        });
      }
      return createMockK8sClient();
    });

    // Call the function and expect it to throw
    await expect(
      restartController(
        "test-ns",
        kind.StatefulSet,
        "test-statefulset",
        "Secret changed",
        mockLogger,
      ),
    ).rejects.toThrow("Test error");

    // Verify logger error was called
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        controller: "StatefulSet",
        name: "test-statefulset",
        namespace: "test-ns",
        error: expect.any(Error),
      }),
      "Failed to patch StatefulSet controller: Secret changed",
    );
  });
});
