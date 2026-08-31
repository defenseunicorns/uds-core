/**
 * Copyright 2024-2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { K8s, fetch, kind } from "pepr";
import { k8sCfg, pathBuilder } from "kubernetes-fluent-client/dist/fluent/utils";
import { Logger } from "pino";
import { afterEach, beforeEach, describe, expect, it, Mock, vi } from "vitest";
import { UDSPackage } from "../crd";
import {
  createEvent,
  getAuthserviceClients,
  Mutex,
  purgeOrphans,
  retryWithDelay,
  validateNamespace,
} from "./utils";

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
    fetch: vi.fn(),
    kind: actualKind,
    Log: mockLog,
  };
});

vi.mock("kubernetes-fluent-client/dist/fluent/utils", () => ({
  k8sCfg: vi.fn(),
  pathBuilder: vi.fn(),
}));

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

describe("purgeOrphans", () => {
  const logger = createMockLogger();
  const stale = {
    kind: "Deployment",
    metadata: {
      name: "shared-egress",
      uid: "uid-1",
      resourceVersion: "42",
      labels: { "uds/generation": "30" },
    },
  };

  function mockPurgeClients(currentGet: ReturnType<typeof vi.fn>) {
    const listClient = createMockK8sClient({ Get: vi.fn().mockResolvedValue({ items: [stale] }) });
    const currentClient = createMockK8sClient({ Get: currentGet });
    vi.mocked(K8s)
      .mockReturnValueOnce(listClient)
      .mockReturnValueOnce(currentClient)
      .mockReturnValueOnce(currentClient);
    return currentClient;
  }

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("does not delete a resource updated after the list", async () => {
    const currentClient = mockPurgeClients(
      vi.fn().mockResolvedValue({
        ...stale,
        metadata: { ...stale.metadata, labels: { "uds/generation": "31" } },
      }),
    );

    await purgeOrphans("31", "istio-egress-gateway", "shared-egress", kind.Deployment, logger);

    expect(currentClient.Get).toHaveBeenCalledWith("shared-egress");
    expect(currentClient.Delete).not.toHaveBeenCalled();
  });

  it("does not delete a replacement created after the list", async () => {
    const currentClient = mockPurgeClients(
      vi.fn().mockResolvedValue({
        ...stale,
        metadata: { ...stale.metadata, uid: "uid-2" },
      }),
    );
    const opts = { method: "DELETE", headers: {} };
    vi.mocked(k8sCfg).mockResolvedValue({ opts, serverUrl: "https://kubernetes" });
    vi.mocked(pathBuilder).mockReturnValue(
      new URL(
        "https://kubernetes/apis/apps/v1/namespaces/istio-egress-gateway/deployments/shared-egress",
      ),
    );
    vi.mocked(fetch).mockResolvedValue({ ok: true, status: 200 } as never);

    await purgeOrphans("31", "istio-egress-gateway", "shared-egress", kind.Deployment, logger);

    expect(fetch).not.toHaveBeenCalled();
    expect(currentClient.Delete).not.toHaveBeenCalled();
  });

  it("does not delete a resource already removed after the list", async () => {
    const currentClient = mockPurgeClients(vi.fn().mockRejectedValue({ status: 404 }));

    await expect(
      purgeOrphans("31", "istio-egress-gateway", "shared-egress", kind.Deployment, logger),
    ).resolves.toBeUndefined();

    expect(currentClient.Delete).not.toHaveBeenCalled();
  });

  it("deletes a stale resource with UID and resourceVersion preconditions", async () => {
    const current = {
      ...stale,
      metadata: {
        ...stale.metadata,
        uid: "uid-1",
        resourceVersion: "42",
      },
    };
    const currentClient = mockPurgeClients(vi.fn().mockResolvedValue(current));
    const opts = { method: "DELETE", headers: {} };
    vi.mocked(k8sCfg).mockResolvedValue({ opts, serverUrl: "https://kubernetes" });
    vi.mocked(pathBuilder).mockReturnValue(
      new URL(
        "https://kubernetes/apis/apps/v1/namespaces/istio-egress-gateway/deployments/shared-egress",
      ),
    );
    vi.mocked(fetch).mockResolvedValue({ ok: true, status: 200 } as never);

    await purgeOrphans("31", "istio-egress-gateway", "shared-egress", kind.Deployment, logger);

    expect(fetch).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({
        method: "DELETE",
        body: JSON.stringify({
          apiVersion: "v1",
          kind: "DeleteOptions",
          preconditions: { uid: "uid-1", resourceVersion: "42" },
        }),
      }),
    );
    expect(currentClient.Delete).not.toHaveBeenCalled();
  });

  it("ignores a delete conflict caused by a concurrent update", async () => {
    mockPurgeClients(
      vi.fn().mockResolvedValue({
        ...stale,
        metadata: { ...stale.metadata, uid: "uid-1", resourceVersion: "42" },
      }),
    );
    vi.mocked(k8sCfg).mockResolvedValue({
      opts: { method: "DELETE", headers: {} },
      serverUrl: "https://kubernetes",
    });
    vi.mocked(pathBuilder).mockReturnValue(
      new URL(
        "https://kubernetes/apis/apps/v1/namespaces/istio-egress-gateway/deployments/shared-egress",
      ),
    );
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 409 } as never);

    await expect(
      purgeOrphans("31", "istio-egress-gateway", "shared-egress", kind.Deployment, logger),
    ).resolves.toBeUndefined();
  });
});

describe("Mutex", () => {
  it("releases lock so subsequent acquires succeed", async () => {
    const mutex = new Mutex();
    const release1 = await mutex.acquire();
    release1();
    const release2 = await mutex.acquire();
    release2();
  });

  it("serializes concurrent operations in acquisition order", async () => {
    const mutex = new Mutex();
    const order: number[] = [];

    const task = async (id: number) => {
      const release = await mutex.acquire();
      order.push(id);
      release();
    };

    await Promise.all([task(1), task(2), task(3)]);

    expect(order).toEqual([1, 2, 3]);
  });

  it("does not allow concurrent holders", async () => {
    const mutex = new Mutex();
    let inside = false;

    const task = async () => {
      const release = await mutex.acquire();
      expect(inside).toBe(false);
      inside = true;
      await Promise.resolve(); // yield to check concurrent access
      inside = false;
      release();
    };

    await Promise.all([task(), task(), task()]);
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
