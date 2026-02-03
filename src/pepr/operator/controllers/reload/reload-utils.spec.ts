/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { GenericClass } from "kubernetes-fluent-client";
import { K8s, kind } from "pepr";
import { Logger } from "pino";
import { beforeEach, describe, expect, it, Mock, vi } from "vitest";
import * as reloadUtils from "./reload-utils.js";
import { reloadPods, restartController } from "./reload-utils.js";

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

vi.mock("../utils", async () => {
  const originalModule = (await vi.importActual("../utils")) as object;
  return {
    ...originalModule,
    retryWithDelay: vi.fn(async <T>(fn: () => Promise<T>) => fn()),
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

// Mock StatefulSet get response
// Test resource helpers
function makeTestPodTemplateSpec() {
  return {
    metadata: {
      labels: { app: "my-app" },
    },
    spec: {
      containers: [
        {
          name: "main",
          image: "busybox",
          command: ["sleep", "3600"],
          env: [{ name: "ENV_VAR", value: "value" }],
          ports: [{ containerPort: 8080 }],
          volumeMounts: [{ name: "data", mountPath: "/data" }],
        },
      ],
      volumes: [{ name: "data", emptyDir: {} }],
      restartPolicy: "Always",
    },
  };
}

function makeTestStatefulSet() {
  return {
    metadata: { name: "test-statefulset", namespace: "default", uid: "test-uid" },
    apiVersion: "apps/v1",
    kind: "StatefulSet",
    spec: {
      replicas: 2,
      selector: { matchLabels: { app: "my-app" } },
      template: makeTestPodTemplateSpec(),
      serviceName: "my-service",
    },
  } as kind.StatefulSet;
}

function makeTestDeployment() {
  return {
    metadata: { name: "test-deployment", namespace: "default", uid: "test-uid" },
    apiVersion: "apps/v1",
    kind: "Deployment",
    spec: {
      replicas: 1,
      selector: { matchLabels: { app: "my-app" } },
      template: makeTestPodTemplateSpec(),
    },
  } as kind.Deployment;
}

function makeTestReplicaSet() {
  return {
    metadata: { name: "test-replicaset", namespace: "default", uid: "test-uid" },
    apiVersion: "apps/v1",
    kind: "ReplicaSet",
    spec: {
      replicas: 1,
      selector: { matchLabels: { app: "my-app" } },
      template: makeTestPodTemplateSpec(),
    },
  } as kind.ReplicaSet;
}

function withRestartedAtAnnotation<T extends object>(obj: T): T {
  const clone = JSON.parse(JSON.stringify(obj));
  clone.spec.template.metadata.annotations = {
    ...(clone.spec.template.metadata.annotations || {}),
    "uds.dev/restartedAt": expect.any(String),
  };
  return clone;
}

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
    vi.spyOn(reloadUtils, "reloadPods").mockClear();

    // Reset tracking variables
    lastUsedControllerKind = null;
    lastControllerName = "";

    // Configure the main K8s mock
    vi.mocked(K8s as Mock).mockImplementation(
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
    await reloadPods("default", [], "Test reason", mockLogger, "Secret");
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

    await reloadPods("default", pods as kind.Pod[], "Test eviction", mockLogger, "Secret");

    // The standalone pod should be evicted
    expect(mockK8sClient.Evict).toHaveBeenCalledWith(podName);
  });

  it("should restart StatefulSets by applying with annotation", async () => {
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

    const testStatefulSet = makeTestStatefulSet();
    mockK8sClient.Get.mockResolvedValueOnce(testStatefulSet);

    await reloadPods("default", pods as kind.Pod[], "Test eviction", mockLogger, "SecretChanged");

    // Should apply the StatefulSet with restart annotation
    expect(mockK8sClient.Apply).toHaveBeenCalledWith(withRestartedAtAnnotation(testStatefulSet));

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
    const testDeployment = makeTestDeployment();
    mockK8sClient.Get.mockResolvedValueOnce(testDeployment);

    await reloadPods("default", pods as kind.Pod[], "Test eviction", mockLogger, "SecretChanged");

    // Should apply the Deployment with restart annotation
    expect(mockK8sClient.Apply).toHaveBeenCalledWith(withRestartedAtAnnotation(testDeployment));

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
              name: "test-replicaset",
              apiVersion: "apps/v1",
              controller: true,
            },
          ],
        },
      },
    ];

    // Mock ReplicaSet with no owner
    const testReplicaSet = makeTestReplicaSet();
    mockK8sClient.Get.mockResolvedValue(testReplicaSet);

    await reloadPods("default", pods as kind.Pod[], "Test eviction", mockLogger, "SecretChanged");

    // Should apply the ReplicaSet directly with restart annotation
    expect(mockK8sClient.Apply).toHaveBeenCalledWith(withRestartedAtAnnotation(testReplicaSet));

    // Verify the correct controller kind was used
    expect(lastUsedControllerKind).toBe(kind.ReplicaSet);
    expect(lastControllerName).toBe("test-replicaset");

    // Should create an event for the ReplicaSet restart
    expect(mockK8sClient.Create).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "Normal",
        reason: "SecretChanged",
        message: "Restarted due to: Test eviction",
        involvedObject: expect.objectContaining({
          kind: "ReplicaSet",
          name: "test-replicaset",
          namespace: "default",
          // uid might be undefined in tests depending on mock implementation
        }),
      }),
    );
  });

  it("should log an error if controller applying fails", async () => {
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

    // Configure mockK8sClient for this test
    const testStatefulSet = makeTestStatefulSet();
    mockK8sClient.Get.mockResolvedValueOnce(testStatefulSet);

    // Fail the Apply call to trigger fallback path
    mockK8sClient.Apply.mockRejectedValueOnce(new Error("Failed to apply controller"));

    // Set up K8s mock to return our mockK8sClient
    vi.mocked(K8s as Mock).mockImplementation((resourceKind, options) => {
      // Track the controller kind and name when a specific controller is targeted
      if (options?.name) {
        lastUsedControllerKind = resourceKind;
        lastControllerName = options.name;
      }
      return mockK8sClient;
    });

    // Execute the function under test
    await reloadPods("default", pods as kind.Pod[], "Test eviction", mockLogger, "Secret");

    // Verify Apply was called
    expect(mockK8sClient.Apply).toHaveBeenCalledWith(withRestartedAtAnnotation(testStatefulSet));

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
    const testDeployment = makeTestDeployment();
    mockK8sClient.Get.mockResolvedValue(testDeployment);

    // Set up K8s mock to return our mockK8sClient
    vi.mocked(K8s as Mock).mockImplementation(() => mockK8sClient);

    // Call the function
    await restartController(
      "default",
      kind.Deployment,
      "test-deployment",
      "Secret changed",
      mockLogger,
      "SecretChanged",
    );

    // Verify Apply was called with the correct annotation
    expect(mockK8sClient.Apply).toHaveBeenCalledWith(withRestartedAtAnnotation(testDeployment));

    // Verify createEvent was called
    expect(mockK8sClient.Create).toHaveBeenCalled();

    // Verify the event has the correct properties
    const eventArg = mockK8sClient.Create.mock.calls[0][0];
    expect(eventArg).toMatchObject({
      involvedObject: {
        apiVersion: "apps/v1",
        kind: "Deployment",
        name: "test-deployment",
        namespace: "default",
      },
      metadata: {
        generateName: "test-deployment",
        namespace: "default",
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
      expect.stringContaining("Successfully restarted Deployment default/test-deployment"),
    );
  });

  it("should throw an error for unsupported controller kinds", async () => {
    // Set up K8s mocks
    vi.mocked(K8s as Mock).mockImplementation(() => createMockK8sClient());

    // Call the function and expect it to throw
    await expect(
      restartController(
        "default",
        {} as GenericClass,
        "test-name",
        "test-reason",
        mockLogger,
        "Secret",
      ),
    ).rejects.toThrow("Unsupported controller kind");
  });

  it("should handle errors during controller restart", async () => {
    // Mock K8s Apply function to throw an error
    const mockApply = vi.fn().mockRejectedValue(new Error("Test error"));

    // Set up K8s mocks with custom implementation
    vi.mocked(K8s as Mock).mockImplementation((resourceKind, options) => {
      if (options?.name && options?.namespace) {
        return createMockK8sClient({
          Apply: mockApply,
        });
      }
      return createMockK8sClient();
    });

    // Call the function and expect it to throw
    await expect(
      restartController(
        "default",
        kind.StatefulSet,
        "test-statefulset",
        "Secret changed",
        mockLogger,
        "Secret",
      ),
    ).rejects.toThrow("Test error");

    // Verify logger error was called
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        controller: "StatefulSet",
        name: "test-statefulset",
        namespace: "default",
        error: expect.any(Error),
      }),
      "Failed to apply StatefulSet controller update: Secret changed",
    );
  });
});
