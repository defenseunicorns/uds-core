/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { K8s, kind } from "pepr";
import { Logger } from "pino";
import { afterEach, beforeEach, describe, expect, it, Mock, vi } from "vitest";
import { UDSPackage } from "../crd/index.js";
import { createEvent, getAuthserviceClients, retryWithDelay, validateNamespace } from "./utils.js";

// Mock K8s client and Log
vi.mock("pepr", () => {
  const actualKind = {
    Pod: "Pod",
    Deployment: "Deployment",
    ReplicaSet: "ReplicaSet",
    StatefulSet: "StatefulSet",
    DaemonSet: "DaemonSet",
    CoreEvent: "CoreEvent",
    Namespace: "Namespace",
  };

  const mockLog = {
    child: vi.fn().mockReturnValue(createMockLogger()),
  };

  return {
    K8s: vi.fn(),
    kind: actualKind,
    Log: mockLog,
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
    Scale: vi.fn().mockResolvedValue({}),
    Finalize: vi.fn().mockResolvedValue({}),

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
      { error: "Fail on 1st try" },
      expect.stringContaining("Attempt 1 of Mock failed, retrying in 100ms."),
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
      { error: "Unknown Error" },
      expect.stringContaining("Attempt 1 of Mock failed, retrying in 100ms."),
    );
  });

  it("should throw the original error after max retries", async () => {
    const error = new Error("Persistent failure");
    const mockFn = vi.fn<() => Promise<string>>().mockRejectedValue(error); // Always fails

    await expect(retryWithDelay(mockFn, mockLogger, 3, 100)).rejects.toThrow("Persistent failure");

    expect(mockFn).toHaveBeenCalledTimes(3); // Retries up to the limit
    expect(mockLogger.warn).toHaveBeenCalledTimes(2); // Logged for each failure except the final one
    expect(mockLogger.warn).toHaveBeenCalledWith(
      { error: error.message },
      expect.stringContaining("Attempt 1 of Mock failed, retrying in 100ms."),
    );
    expect(mockLogger.warn).toHaveBeenCalledWith(
      { error: error.message },
      expect.stringContaining("Attempt 2 of Mock failed, retrying in 100ms."),
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
    vi.mocked(K8s as Mock).mockImplementation(() => mockK8sClient);

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
    vi.mocked(K8s as Mock).mockImplementation(() =>
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

describe("test validateNamespace", () => {
  beforeEach(() => {
    process.env.PEPR_WATCH_MODE = "true";
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should return namespace object when namespace is found", async () => {
    // Mock K8s Get function to return test-ns
    const mockNamespace = { metadata: { name: "test-ns" } } as kind.Namespace;
    const mockGet = vi.fn().mockResolvedValue(mockNamespace);

    // Set up K8s mocks
    vi.mocked(K8s).mockReturnValue(
      createMockK8sClient({
        Get: mockGet,
      }),
    );

    await expect(validateNamespace("test-ns")).resolves.toEqual(mockNamespace);
  });

  it("should return null if namespace is missing with missingAllowed=true", async () => {
    // Mock K8s Get function to return test-ns
    const error = { status: 404, message: "Namespace not found" };
    const mockGet = vi.fn().mockRejectedValue(error);

    // Set up K8s mocks
    vi.mocked(K8s).mockReturnValue(
      createMockK8sClient({
        Get: mockGet,
      }),
    );

    await expect(validateNamespace("test-ns", true)).resolves.toEqual(null);
  });

  it("should throw error if namespace is missing with missingAllowed=false", async () => {
    // Mock K8s Get function to return test-ns
    const error = { status: 404, message: "Namespace not found" };
    const mockGet = vi.fn().mockRejectedValue(error);

    // Set up K8s mocks
    vi.mocked(K8s).mockReturnValue(
      createMockK8sClient({
        Get: mockGet,
      }),
    );

    await expect(validateNamespace("test-ns", false)).rejects.toEqual(error);
  });

  it("should throw error for non-404 errors even with missingAllowed=true", async () => {
    // Mock K8s Get function to return test-ns
    const error = { status: 401, message: "Namespace not found" };
    const mockGet = vi.fn().mockRejectedValue(error);

    // Set up K8s mocks
    vi.mocked(K8s).mockReturnValue(
      createMockK8sClient({
        Get: mockGet,
      }),
    );

    await expect(validateNamespace("test-ns", true)).rejects.toEqual(error);
  });
});

describe("getAuthserviceClients", () => {
  it("returns only SSO clients with enableAuthserviceSelector present (not null/undefined)", () => {
    const pkg = {
      apiVersion: "uds.dev/v1",
      kind: "UDSPackage",
      metadata: { name: "test-pkg", namespace: "test-ns" },
      spec: {
        sso: [
          { clientId: "a", name: "", enableAuthserviceSelector: {} },
          { clientId: "b", name: "", enableAuthserviceSelector: { foo: "bar" } },
          { clientId: "c", name: "", enableAuthserviceSelector: { foo: "" } },
          { clientId: "d", name: "" }, // missing key
          { clientId: "e", name: "", enableAuthserviceSelector: null },
          { clientId: "f", name: "", enableAuthserviceSelector: undefined }, // undefined value
        ],
      },
    } as unknown as UDSPackage;

    const res = getAuthserviceClients(pkg);
    expect(res.map(c => c.clientId)).toEqual(["a", "b", "c"]);
  });
});
