/**
 * Copyright 2024-2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { GenericClass } from "kubernetes-fluent-client";
import { K8s, kind } from "pepr";
import { Logger } from "pino";
import { beforeEach, describe, expect, it, Mock, vi } from "vitest";
import { handleSecretUpdate, secretReloadStateCache, SSA_CLEANUP_ANNOTATION } from "./pod-reload";
import * as reloadUtils from "./reload-utils";
import {
  cleanupOverClaimedControllerFields,
  controllerEntryIsOverClaimed,
  reloadPods,
  restartController,
} from "./reload-utils";

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
    Log: {
      child: vi.fn(() => ({
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      })),
    },
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

function sparseRestartPatch() {
  return {
    spec: {
      template: {
        metadata: {
          annotations: { "uds.dev/restartedAt": expect.any(String) },
        },
      },
    },
  };
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

  it("evicts standalone pods", async () => {
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

    expect(mockK8sClient.Evict).toHaveBeenCalledWith(podName);
    expect(mockK8sClient.Delete).not.toHaveBeenCalled();
  });

  it("preserves the Delete fallback for standalone pods", async () => {
    mockK8sClient.Evict.mockRejectedValue(new Error("eviction failed"));
    const pod = { metadata: { name: "standalone-pod", namespace: "default" } } as kind.Pod;

    await reloadPods("default", [pod], "Test eviction", mockLogger, "Secret");

    expect(mockK8sClient.Delete).toHaveBeenCalledWith(pod);
  });

  it("evicts pods with unsupported controllers", async () => {
    const pod = {
      metadata: {
        name: "job-pod",
        namespace: "default",
        ownerReferences: [{ kind: "Job", name: "job", uid: "owner", controller: true }],
      },
    } as kind.Pod;

    await reloadPods("default", [pod], "Test eviction", mockLogger, "Secret");

    expect(mockK8sClient.Evict).toHaveBeenCalledWith("job-pod");
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
    expect(mockK8sClient.Apply).toHaveBeenCalledWith(sparseRestartPatch(), { force: true });

    // Verify the correct controller kind was used
    expect(lastUsedControllerKind).toBe(kind.StatefulSet);
    expect(lastControllerName).toBe("test-statefulset");
    expect(mockK8sClient.Evict).not.toHaveBeenCalled();

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
    expect(mockK8sClient.Apply).toHaveBeenCalledWith(sparseRestartPatch(), { force: true });

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
    expect(mockK8sClient.Apply).toHaveBeenCalledWith(sparseRestartPatch(), { force: true });

    // Verify the correct controller kind was used
    expect(lastUsedControllerKind).toBe(kind.ReplicaSet);
    expect(lastControllerName).toBe("test-replicaset");
    expect(mockK8sClient.Evict).toHaveBeenCalledWith("replicaset-pod");

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

  it.each(["StatefulSet", "DaemonSet"])(
    "evicts every %s pod when its update strategy is OnDelete",
    async controllerKind => {
      const pods = ["pod-0", "pod-1"].map(name => ({
        metadata: {
          name,
          namespace: "default",
          ownerReferences: [
            { kind: controllerKind, name: "test-controller", uid: "owner", controller: true },
          ],
        },
      })) as kind.Pod[];
      mockK8sClient.Get.mockResolvedValue({
        metadata: { name: "test-controller", namespace: "default", uid: "owner" },
        spec: { updateStrategy: { type: "OnDelete" } },
      });

      await reloadPods("default", pods, "Test eviction", mockLogger, "SecretChanged");

      expect(mockK8sClient.Apply).toHaveBeenCalledTimes(1);
      expect(mockK8sClient.Evict).toHaveBeenCalledWith("pod-0");
      expect(mockK8sClient.Evict).toHaveBeenCalledWith("pod-1");
    },
  );

  it.each(["StatefulSet", "DaemonSet"])(
    "does not bypass a denied eviction for an OnDelete %s",
    async controllerKind => {
      const pod = {
        metadata: {
          name: "managed-pod",
          namespace: "default",
          ownerReferences: [
            { kind: controllerKind, name: "test-controller", uid: "owner", controller: true },
          ],
        },
      } as kind.Pod;
      mockK8sClient.Get.mockResolvedValue({
        metadata: { name: "test-controller", namespace: "default", uid: "owner" },
        spec: { updateStrategy: { type: "OnDelete" } },
      });
      mockK8sClient.Evict.mockRejectedValue(new Error("eviction denied"));

      await expect(
        reloadPods("default", [pod], "Test eviction", mockLogger, "SecretChanged"),
      ).rejects.toThrow("Failed to reload pods");
      expect(mockK8sClient.Delete).not.toHaveBeenCalled();
    },
  );

  it("retries a rolling controller recreated while another pod's eviction is pending", async () => {
    const pods = [
      {
        metadata: {
          name: "deployment-pod",
          ownerReferences: [
            { kind: "Deployment", name: "deployment", uid: "deployment-owner", controller: true },
          ],
        },
      },
      {
        metadata: {
          name: "ondelete-pod",
          ownerReferences: [
            { kind: "StatefulSet", name: "ondelete", uid: "ondelete-owner", controller: true },
          ],
        },
      },
    ] as kind.Pod[];
    const deploymentClient = createMockK8sClient();
    const replacementDeployment = makeTestDeployment();
    replacementDeployment.metadata!.uid = "replacement-uid";
    deploymentClient.Get.mockResolvedValueOnce(makeTestDeployment()).mockResolvedValue(
      replacementDeployment,
    );
    const onDeleteClient = createMockK8sClient();
    onDeleteClient.Get.mockResolvedValue({
      metadata: { name: "ondelete", namespace: "default", uid: "ondelete-owner" },
      spec: { updateStrategy: { type: "OnDelete" } },
    });
    vi.mocked(K8s as Mock).mockImplementation(resourceKind => {
      if (resourceKind === kind.Deployment) return deploymentClient;
      if (resourceKind === kind.StatefulSet) return onDeleteClient;
      return mockK8sClient;
    });
    mockK8sClient.Evict.mockRejectedValueOnce(new Error("eviction denied"));

    await expect(
      reloadPods("default", pods, "Test eviction", mockLogger, "SecretChanged"),
    ).rejects.toThrow("Failed to reload pods");
    expect(deploymentClient.Apply).toHaveBeenCalledTimes(1);

    await reloadPods("default", pods, "Test eviction", mockLogger, "SecretChanged");
    expect(deploymentClient.Get).toHaveBeenCalledTimes(2);
    expect(deploymentClient.Apply).toHaveBeenCalledTimes(2);
    expect(mockK8sClient.Evict).toHaveBeenCalledTimes(2);
  });

  it("should report an error if controller applying fails", async () => {
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
    await expect(
      reloadPods("default", pods as kind.Pod[], "Test eviction", mockLogger, "Secret"),
    ).rejects.toThrow("Failed to reload pods");

    // Verify Apply was called
    expect(mockK8sClient.Apply).toHaveBeenCalledWith(sparseRestartPatch(), { force: true });

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

  it("reports a partial reload after one controller restarts and another fails", async () => {
    const pods = ["working", "failing"].map(name => ({
      metadata: {
        name: `${name}-pod`,
        namespace: "default",
        ownerReferences: [{ kind: "StatefulSet", name, uid: `${name}-uid`, controller: true }],
      },
    })) as kind.Pod[];
    const failingClient = createMockK8sClient();
    failingClient.Apply.mockRejectedValue(new Error("apply failed"));
    mockK8sClient.Get.mockImplementation(async (name: string) => ({
      metadata: { name, namespace: "default", uid: `${name}-uid` },
      spec: { updateStrategy: { type: "RollingUpdate" } },
    }));
    failingClient.Get.mockImplementation(mockK8sClient.Get);
    vi.mocked(K8s as Mock).mockImplementation((_resourceKind, options) =>
      options?.name === "failing" ? failingClient : mockK8sClient,
    );

    await expect(
      reloadPods("default", pods, "Test eviction", mockLogger, "SecretChanged"),
    ).rejects.toThrow("Failed to reload pods");

    expect(mockK8sClient.Apply).toHaveBeenCalledTimes(1);
    expect(failingClient.Apply).toHaveBeenCalledTimes(1);
  });

  it("does not delete an orphaned ReplicaSet pod when eviction fails", async () => {
    mockK8sClient.Evict.mockRejectedValue(new Error("eviction failed"));
    mockK8sClient.Get.mockResolvedValue(makeTestReplicaSet());
    const pod = {
      metadata: {
        name: "replicaset-pod",
        namespace: "default",
        ownerReferences: [
          { kind: "ReplicaSet", name: "test-replicaset", uid: "owner", controller: true },
        ],
      },
    } as kind.Pod;

    await expect(
      reloadPods("default", [pod], "Test eviction", mockLogger, "Secret"),
    ).rejects.toThrow("Failed to reload pods");
    expect(mockK8sClient.Evict).toHaveBeenCalledWith("replicaset-pod");
    expect(mockK8sClient.Delete).not.toHaveBeenCalled();

    mockK8sClient.Evict.mockResolvedValue({});
    await expect(
      reloadPods("default", [pod], "Test eviction", mockLogger, "Secret"),
    ).resolves.toBeUndefined();
  });

  it("retries a creation reload after an orphaned ReplicaSet eviction fails", async () => {
    secretReloadStateCache.clear();
    const pod = {
      metadata: {
        name: "replicaset-pod",
        namespace: "default",
        ownerReferences: [
          { kind: "ReplicaSet", name: "test-replicaset", uid: "owner", controller: true },
        ],
      },
      status: { phase: "Running", startTime: "2026-09-30T10:00:00Z" },
      spec: {
        containers: [{ name: "app", image: "example:latest" }],
        volumes: [{ name: "config", secret: { secretName: "late-secret", optional: true } }],
      },
    } as unknown as kind.Pod;
    const secret = {
      metadata: {
        name: "late-secret",
        namespace: "default",
        creationTimestamp: "2026-09-30T10:05:00Z",
        annotations: { [SSA_CLEANUP_ANNOTATION]: "true" },
      },
      data: { key: "dmFsdWU=" },
    } as unknown as kind.Secret;
    mockK8sClient.Get.mockResolvedValue({ items: [pod] });
    mockK8sClient.Evict.mockRejectedValue(new Error("eviction failed"));

    await expect(handleSecretUpdate(secret)).rejects.toThrow("Failed to reload pods");
    expect(secretReloadStateCache.get("default/late-secret")?.status).toBe("creating");
    expect(mockK8sClient.Delete).not.toHaveBeenCalled();

    mockK8sClient.Evict.mockResolvedValue({});
    await handleSecretUpdate(secret);
    expect(mockK8sClient.Evict).toHaveBeenCalledTimes(2);
    expect(secretReloadStateCache.has("default/late-secret")).toBe(true);
    secretReloadStateCache.clear();
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
    expect(mockK8sClient.Apply).toHaveBeenCalledWith(sparseRestartPatch(), { force: true });

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

  it("strips over-claimed managedFields entry before applying when Pepr owns extra spec fields", async () => {
    const mockK8sClient = createMockK8sClient({
      Get: vi.fn().mockResolvedValue({
        ...makeTestStatefulSet(),
        metadata: {
          name: "test-statefulset",
          namespace: "default",
          uid: "test-uid",
          managedFields: [
            {
              manager: "pepr",
              operation: "Apply",
              fieldsV1: {
                "f:spec": {
                  "f:replicas": {},
                  "f:template": {
                    "f:metadata": {
                      "f:annotations": { "f:uds.dev/restartedAt": {} },
                    },
                  },
                },
              },
            },
          ],
        },
      }),
    });
    (K8s as Mock).mockReturnValue(mockK8sClient);
    const mockLogger = createMockLogger();

    await restartController(
      "default",
      kind.StatefulSet,
      "test-statefulset",
      "CA changed",
      mockLogger,
      "CA",
    );

    // Patch should have been called to strip the over-claimed entry
    expect(mockK8sClient.Patch).toHaveBeenCalledWith([
      { op: "test", path: "/metadata/managedFields/0/manager", value: "pepr" },
      { op: "test", path: "/metadata/managedFields/0/operation", value: "Apply" },
      { op: "remove", path: "/metadata/managedFields/0" },
    ]);
    expect(mockK8sClient.Apply).toHaveBeenCalled();
  });

  it("does not strip managedFields when Pepr entry only owns the restart annotation", async () => {
    const mockK8sClient = createMockK8sClient({
      Get: vi.fn().mockResolvedValue({
        ...makeTestStatefulSet(),
        metadata: {
          name: "test-statefulset",
          namespace: "default",
          uid: "test-uid",
          managedFields: [
            {
              manager: "pepr",
              operation: "Apply",
              fieldsV1: {
                "f:spec": {
                  "f:template": {
                    "f:metadata": {
                      "f:annotations": { "f:uds.dev/restartedAt": {} },
                    },
                  },
                },
              },
            },
          ],
        },
      }),
    });
    (K8s as Mock).mockReturnValue(mockK8sClient);
    const mockLogger = createMockLogger();

    await restartController(
      "default",
      kind.StatefulSet,
      "test-statefulset",
      "CA changed",
      mockLogger,
      "CA",
    );

    expect(mockK8sClient.Patch).not.toHaveBeenCalled();
    expect(mockK8sClient.Apply).toHaveBeenCalled();
  });

  it("throws and skips Apply when the managedFields Patch fails", async () => {
    const patchError = new Error("test op failed");
    const mockK8sClient = createMockK8sClient({
      Get: vi.fn().mockResolvedValue({
        ...makeTestStatefulSet(),
        metadata: {
          name: "test-statefulset",
          namespace: "default",
          uid: "test-uid",
          managedFields: [
            {
              manager: "pepr",
              operation: "Apply",
              fieldsV1: {
                "f:spec": {
                  "f:replicas": {},
                  "f:template": {
                    "f:metadata": {
                      "f:annotations": { "f:uds.dev/restartedAt": {} },
                    },
                  },
                },
              },
            },
          ],
        },
      }),
      Patch: vi.fn().mockRejectedValueOnce(patchError),
    });
    (K8s as Mock).mockReturnValue(mockK8sClient);
    const mockLogger = createMockLogger();

    await expect(
      restartController(
        "default",
        kind.StatefulSet,
        "test-statefulset",
        "CA changed",
        mockLogger,
        "CA",
      ),
    ).rejects.toThrow("test op failed");

    expect(mockK8sClient.Patch).toHaveBeenCalled();
    // Apply must NOT run when cleanup fails — sparse Apply on stale ownership could drop fields
    expect(mockK8sClient.Apply).not.toHaveBeenCalled();
  });
});

describe("controllerEntryIsOverClaimed", () => {
  it("returns false for an exactly-correct sparse entry", () => {
    expect(
      controllerEntryIsOverClaimed({
        fieldsV1: {
          "f:spec": {
            "f:template": {
              "f:metadata": {
                "f:annotations": { "f:uds.dev/restartedAt": {} },
              },
            },
          },
        },
      }),
    ).toBe(false);
  });

  it("returns false when fieldsV1 has no spec", () => {
    expect(controllerEntryIsOverClaimed({ fieldsV1: {} })).toBe(false);
  });

  it("returns true when spec has extra fields beyond f:template", () => {
    expect(
      controllerEntryIsOverClaimed({
        fieldsV1: {
          "f:spec": {
            "f:replicas": {},
            "f:template": {
              "f:metadata": { "f:annotations": { "f:uds.dev/restartedAt": {} } },
            },
          },
        },
      }),
    ).toBe(true);
  });

  it("returns true when template has extra fields beyond f:metadata", () => {
    expect(
      controllerEntryIsOverClaimed({
        fieldsV1: {
          "f:spec": {
            "f:template": {
              "f:metadata": { "f:annotations": { "f:uds.dev/restartedAt": {} } },
              "f:spec": { "f:containers": {} },
            },
          },
        },
      }),
    ).toBe(true);
  });

  it("returns true when annotations contain extra keys", () => {
    expect(
      controllerEntryIsOverClaimed({
        fieldsV1: {
          "f:spec": {
            "f:template": {
              "f:metadata": {
                "f:annotations": {
                  "f:uds.dev/restartedAt": {},
                  "f:kubectl.kubernetes.io/last-applied-configuration": {},
                },
              },
            },
          },
        },
      }),
    ).toBe(true);
  });

  it("returns true when fieldsV1 has a top-level key beyond f:spec", () => {
    expect(
      controllerEntryIsOverClaimed({
        fieldsV1: {
          "f:spec": {
            "f:template": {
              "f:metadata": { "f:annotations": { "f:uds.dev/restartedAt": {} } },
            },
          },
          "f:metadata": { "f:labels": {} },
        },
      }),
    ).toBe(true);
  });
});

describe("cleanupOverClaimedControllerFields", () => {
  let mockLogger: Logger;
  let mockK8sClient: ReturnType<typeof createMockK8sClient>;

  beforeEach(() => {
    vi.resetAllMocks();
    mockLogger = createMockLogger();
    mockK8sClient = createMockK8sClient();
    vi.mocked(K8s as Mock).mockReturnValue(mockK8sClient);
  });

  it("no-op when pod list is empty", async () => {
    await cleanupOverClaimedControllerFields("default", [], mockLogger);
    expect(mockK8sClient.Get).not.toHaveBeenCalled();
  });

  it("no-op when pods have no controller ownerRef", async () => {
    const pods = [{ metadata: { name: "standalone" } }];
    await cleanupOverClaimedControllerFields("default", pods as kind.Pod[], mockLogger);
    expect(mockK8sClient.Get).not.toHaveBeenCalled();
  });

  it("skips Succeeded and Failed pods", async () => {
    const pods = [
      {
        metadata: {
          name: "pod-a",
          ownerReferences: [{ kind: "Deployment", name: "dep", controller: true }],
        },
        status: { phase: "Succeeded" },
      },
      {
        metadata: {
          name: "pod-b",
          ownerReferences: [{ kind: "Deployment", name: "dep", controller: true }],
        },
        status: { phase: "Failed" },
      },
    ];
    await cleanupOverClaimedControllerFields("default", pods as kind.Pod[], mockLogger);
    expect(mockK8sClient.Get).not.toHaveBeenCalled();
  });

  it("cleans up over-claimed Deployment entry discovered via pod ownerRef", async () => {
    const pods = [
      {
        metadata: {
          name: "dep-pod",
          ownerReferences: [{ kind: "Deployment", name: "test-dep", controller: true }],
        },
      },
    ];
    mockK8sClient.Get.mockResolvedValue({
      ...makeTestDeployment(),
      metadata: {
        name: "test-dep",
        namespace: "default",
        uid: "uid",
        managedFields: [
          {
            manager: "pepr",
            operation: "Apply",
            fieldsV1: {
              "f:spec": {
                "f:replicas": {},
                "f:template": {
                  "f:metadata": { "f:annotations": { "f:uds.dev/restartedAt": {} } },
                },
              },
            },
          },
        ],
      },
      spec: {
        template: {
          metadata: { annotations: { "uds.dev/restartedAt": "2026-01-01T00:00:00.000Z" } },
        },
      },
    });

    await cleanupOverClaimedControllerFields("default", pods as kind.Pod[], mockLogger);

    expect(mockK8sClient.Patch).toHaveBeenCalledWith([
      { op: "test", path: "/metadata/managedFields/0/manager", value: "pepr" },
      { op: "test", path: "/metadata/managedFields/0/operation", value: "Apply" },
      { op: "remove", path: "/metadata/managedFields/0" },
    ]);
    // Should re-apply the existing timestamp to re-establish narrow ownership
    expect(mockK8sClient.Apply).toHaveBeenCalledWith(
      {
        spec: {
          template: {
            metadata: { annotations: { "uds.dev/restartedAt": "2026-01-01T00:00:00.000Z" } },
          },
        },
      },
      { force: true },
    );
  });

  it("skips cleanup when controller entry is not over-claimed", async () => {
    const pods = [
      {
        metadata: {
          name: "dep-pod",
          ownerReferences: [{ kind: "Deployment", name: "test-dep", controller: true }],
        },
      },
    ];
    mockK8sClient.Get.mockResolvedValue({
      ...makeTestDeployment(),
      metadata: {
        name: "test-dep",
        namespace: "default",
        uid: "uid",
        managedFields: [
          {
            manager: "pepr",
            operation: "Apply",
            fieldsV1: {
              "f:spec": {
                "f:template": {
                  "f:metadata": { "f:annotations": { "f:uds.dev/restartedAt": {} } },
                },
              },
            },
          },
        ],
      },
    });

    await cleanupOverClaimedControllerFields("default", pods as kind.Pod[], mockLogger);
    expect(mockK8sClient.Patch).not.toHaveBeenCalled();
    expect(mockK8sClient.Apply).not.toHaveBeenCalled();
  });

  it("resolves ReplicaSet to parent Deployment and cleans up over-claimed entry", async () => {
    const pods = [
      {
        metadata: {
          name: "rs-pod",
          ownerReferences: [{ kind: "ReplicaSet", name: "test-rs", controller: true }],
        },
      },
    ];
    // First Get: the ReplicaSet (with Deployment owner)
    mockK8sClient.Get.mockResolvedValueOnce({
      metadata: {
        name: "test-rs",
        ownerReferences: [{ kind: "Deployment", name: "test-dep", controller: true }],
      },
    });
    // Second Get: the Deployment (over-claimed entry — cleanup should run)
    mockK8sClient.Get.mockResolvedValueOnce({
      ...makeTestDeployment(),
      metadata: {
        name: "test-dep",
        namespace: "default",
        uid: "uid",
        managedFields: [
          {
            manager: "pepr",
            operation: "Apply",
            fieldsV1: {
              "f:spec": {
                "f:replicas": {},
                "f:template": {
                  "f:metadata": { "f:annotations": { "f:uds.dev/restartedAt": {} } },
                },
              },
            },
          },
        ],
      },
      spec: {
        template: {
          metadata: { annotations: { "uds.dev/restartedAt": "2026-01-01T00:00:00.000Z" } },
        },
      },
    });

    await cleanupOverClaimedControllerFields("default", pods as kind.Pod[], mockLogger);
    expect(mockK8sClient.Patch).toHaveBeenCalledWith([
      { op: "test", path: "/metadata/managedFields/0/manager", value: "pepr" },
      { op: "test", path: "/metadata/managedFields/0/operation", value: "Apply" },
      { op: "remove", path: "/metadata/managedFields/0" },
    ]);
    expect(mockK8sClient.Apply).toHaveBeenCalledWith(
      {
        spec: {
          template: {
            metadata: { annotations: { "uds.dev/restartedAt": "2026-01-01T00:00:00.000Z" } },
          },
        },
      },
      { force: true },
    );
  });

  it("resolves standalone ReplicaSet (no Deployment owner) and cleans up over-claimed entry", async () => {
    const pods = [
      {
        metadata: {
          name: "rs-pod",
          ownerReferences: [{ kind: "ReplicaSet", name: "test-rs", controller: true }],
        },
      },
    ];
    // First Get: ReplicaSet (no Deployment owner — resolveControllerKindAndName)
    mockK8sClient.Get.mockResolvedValueOnce({
      metadata: { name: "test-rs", ownerReferences: [] },
    });
    // Second Get: ReplicaSet again (cleanupControllerEntry — over-claimed entry should be removed)
    mockK8sClient.Get.mockResolvedValueOnce({
      ...makeTestReplicaSet(),
      metadata: {
        name: "test-rs",
        namespace: "default",
        uid: "uid",
        ownerReferences: [],
        managedFields: [
          {
            manager: "pepr",
            operation: "Apply",
            fieldsV1: {
              "f:spec": {
                "f:replicas": {},
                "f:template": {
                  "f:metadata": { "f:annotations": { "f:uds.dev/restartedAt": {} } },
                },
              },
            },
          },
        ],
      },
      spec: {
        template: {
          metadata: { annotations: { "uds.dev/restartedAt": "2026-01-01T00:00:00.000Z" } },
        },
      },
    });

    await cleanupOverClaimedControllerFields("default", pods as kind.Pod[], mockLogger);
    expect(mockK8sClient.Patch).toHaveBeenCalledWith([
      { op: "test", path: "/metadata/managedFields/0/manager", value: "pepr" },
      { op: "test", path: "/metadata/managedFields/0/operation", value: "Apply" },
      { op: "remove", path: "/metadata/managedFields/0" },
    ]);
    expect(mockK8sClient.Apply).toHaveBeenCalledWith(
      {
        spec: {
          template: {
            metadata: { annotations: { "uds.dev/restartedAt": "2026-01-01T00:00:00.000Z" } },
          },
        },
      },
      { force: true },
    );
  });

  it("deduplicates controllers when multiple pods share the same controller", async () => {
    const pods = [
      {
        metadata: {
          name: "pod-a",
          ownerReferences: [{ kind: "Deployment", name: "dep", controller: true }],
        },
      },
      {
        metadata: {
          name: "pod-b",
          ownerReferences: [{ kind: "Deployment", name: "dep", controller: true }],
        },
      },
    ];
    mockK8sClient.Get.mockResolvedValue({
      ...makeTestDeployment(),
      metadata: { name: "dep", namespace: "default", uid: "uid", managedFields: [] },
    });

    await cleanupOverClaimedControllerFields("default", pods as kind.Pod[], mockLogger);
    // Should only GET the Deployment once
    expect(mockK8sClient.Get).toHaveBeenCalledTimes(1);
  });

  it("re-applies existing timestamp after removing stale entry", async () => {
    const timestamp = "2026-03-01T12:00:00.000Z";
    const pods = [
      {
        metadata: {
          name: "pod-a",
          ownerReferences: [{ kind: "StatefulSet", name: "test-ss", controller: true }],
        },
      },
    ];
    mockK8sClient.Get.mockResolvedValue({
      ...makeTestStatefulSet(),
      metadata: {
        name: "test-ss",
        namespace: "default",
        uid: "uid",
        managedFields: [
          {
            manager: "pepr",
            operation: "Apply",
            fieldsV1: {
              "f:spec": {
                "f:replicas": {},
                "f:template": {
                  "f:metadata": { "f:annotations": { "f:uds.dev/restartedAt": {} } },
                },
              },
            },
          },
        ],
      },
      spec: { template: { metadata: { annotations: { "uds.dev/restartedAt": timestamp } } } },
    });

    await cleanupOverClaimedControllerFields("default", pods as kind.Pod[], mockLogger);
    expect(mockK8sClient.Apply).toHaveBeenCalledWith(
      { spec: { template: { metadata: { annotations: { "uds.dev/restartedAt": timestamp } } } } },
      { force: true },
    );
  });

  it("logs warning and continues when cleanup fails for one controller", async () => {
    const pods = [
      {
        metadata: {
          name: "pod-a",
          ownerReferences: [{ kind: "Deployment", name: "dep", controller: true }],
        },
      },
    ];
    mockK8sClient.Get.mockRejectedValueOnce(new Error("API error"));

    await expect(
      cleanupOverClaimedControllerFields("default", pods as kind.Pod[], mockLogger),
    ).resolves.toBeUndefined();
    expect(mockLogger.warn).toHaveBeenCalled();
  });
});
