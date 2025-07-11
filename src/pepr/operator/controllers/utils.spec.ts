/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { K8s, kind } from "pepr";
import { Logger } from "pino";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEvent, retryWithDelay } from "./utils";

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
