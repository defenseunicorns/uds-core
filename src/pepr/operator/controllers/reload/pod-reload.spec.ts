/**
 * Copyright 2025-2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { K8s, kind } from "pepr";
import { afterEach, beforeEach, describe, expect, it, Mock, vi } from "vitest";
import {
  SSA_CLEANUP_ANNOTATION,
  computeResourceChecksum,
  configMapReloadStateCache,
  discoverConfigMapConsumers,
  discoverSecretConsumers,
  handleConfigMapDelete,
  handleConfigMapUpdate,
  handleSecretDelete,
  handleSecretUpdate,
  parseSelectorString,
  startupCleanupQueue,
} from "./pod-reload";
import * as utils from "./reload-utils";

// Create hoisted mocks
const mocks = vi.hoisted(() => ({
  mockDebug: vi.fn(),
  mockInfo: vi.fn(),
  mockWarn: vi.fn(),
  mockError: vi.fn(),
}));

// Mock the logger
vi.mock("../../../logger.js", () => ({
  Component: { OPERATOR_SECRETS: "OPERATOR_SECRETS" },
  setupLogger: vi.fn().mockImplementation(() => ({
    debug: mocks.mockDebug,
    info: mocks.mockInfo,
    warn: mocks.mockWarn,
    error: mocks.mockError,
  })),
}));

// Destructure mocks for easier access
const { mockDebug, mockInfo, mockError } = mocks;

// Mock dependencies
vi.mock("pepr", async importOriginal => {
  const originalModule = await importOriginal<typeof import("pepr")>();

  return {
    ...originalModule,
    K8s: vi.fn(),
    kind: {
      Pod: "Pod",
      Secret: "Secret",
      ConfigMap: "ConfigMap",
      StatefulSet: "StatefulSet",
    },
  };
});

vi.mock("./reload-utils", async () => {
  return {
    reloadPods: vi.fn(),
    cleanupOverClaimedControllerFields: vi.fn(),
    resolveControllerKindAndName: vi.fn(),
  };
});

// Import the caches directly
import { secretReloadStateCache } from "./pod-reload";

describe("pod-reload", () => {
  // Clear the caches before each test
  beforeEach(() => {
    secretReloadStateCache.clear();
    configMapReloadStateCache.clear();
  });

  // Global mocks for K8s API
  const mockGet = vi.fn();
  const mockApply = vi.fn();
  const mockPatch = vi.fn().mockResolvedValue({});
  const mockWithLabel = vi.fn().mockReturnThis();
  const mockInNamespace = vi.fn().mockReturnThis();

  // Define interface for K8s response
  interface K8sResponse<T = unknown> {
    items: T[];
  }

  // Helper function to setup K8s mock with standard methods
  function setupK8sMock(mockGetResponse: K8sResponse = { items: [] }) {
    // Reset the mocks
    mockGet.mockReset();
    mockApply.mockReset();
    mockPatch.mockReset().mockResolvedValue({});
    mockWithLabel.mockReset().mockReturnThis();
    mockInNamespace.mockReset().mockReturnThis();

    // Set the response for mockGet
    mockGet.mockResolvedValue(mockGetResponse);

    // Create the mock K8s client
    const mockK8sClient = {
      InNamespace: mockInNamespace,
      WithLabel: mockWithLabel,
      Get: mockGet,
      // Add required methods to satisfy the TypeScript interface
      Logs: vi.fn(),
      Delete: vi.fn(),
      Evict: vi.fn(),
      Watch: vi.fn(),
      Apply: mockApply,
      WithField: vi.fn().mockReturnThis(),
      Create: vi.fn(),
      Patch: mockPatch,
      PatchStatus: vi.fn(),
      Raw: vi.fn(),
      Proxy: vi.fn(),
    };

    // Setup the K8s function mock
    vi.mocked(K8s as Mock).mockImplementation(() => mockK8sClient);
  }

  beforeEach(() => {
    vi.resetAllMocks();
    secretReloadStateCache.clear();
    configMapReloadStateCache.clear();

    // Setup K8s mock with empty items array by default
    setupK8sMock({ items: [] });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("computeResourceChecksum", () => {
    it("should compute consistent checksums for the same data", () => {
      const data1 = { key1: "value1", key2: "value2" };
      const data2 = { key2: "value2", key1: "value1" }; // Same data, different order

      const checksum1 = computeResourceChecksum(data1);
      const checksum2 = computeResourceChecksum(data2);

      expect(checksum1).toBeTruthy();
      expect(checksum2).toBeTruthy();
      expect(checksum1).toBe(checksum2);
    });

    it("should compute different checksums for different data", () => {
      const data1 = { key1: "value1", key2: "value2" };
      const data2 = { key1: "value1", key2: "different" };

      const checksum1 = computeResourceChecksum(data1);
      const checksum2 = computeResourceChecksum(data2);

      expect(checksum1).not.toBe(checksum2);
    });
  });

  describe("handleSecretUpdate", () => {
    it("should do nothing if secret is missing metadata or data", async () => {
      // Missing metadata
      await handleSecretUpdate({} as kind.Secret);
      expect(utils.reloadPods).not.toHaveBeenCalled();

      // Missing name
      await handleSecretUpdate({ metadata: {} } as kind.Secret);
      expect(utils.reloadPods).not.toHaveBeenCalled();

      // Missing namespace
      await handleSecretUpdate({ metadata: { name: "test-secret" } } as kind.Secret);
      expect(utils.reloadPods).not.toHaveBeenCalled();

      // Missing data
      await handleSecretUpdate({
        metadata: { name: "test-secret", namespace: "default" },
      } as kind.Secret);
      expect(utils.reloadPods).not.toHaveBeenCalled();
    });

    it("should not reload pods if the checksum has not changed", async () => {
      // Setup a secret with metadata and data
      const secret = {
        metadata: {
          name: "test-secret",
          namespace: "default",
        },
        data: {
          username: "dXNlcm5hbWU=", // base64 'username'
          password: "cGFzc3dvcmQ=", // base64 'password'
        },
      };

      // First call should cache the checksum
      await handleSecretUpdate(secret as kind.Secret);
      expect(utils.reloadPods).not.toHaveBeenCalled();

      // Second call with the same data should not reload pods
      await handleSecretUpdate(secret as kind.Secret);
      expect(utils.reloadPods).not.toHaveBeenCalled();
    });

    it("should call cleanupOverClaimedControllerFields on first observation and not reload pods", async () => {
      const secret = {
        metadata: { name: "test-secret", namespace: "default" },
        data: { key: "dmFsdWU=" },
      };

      await handleSecretUpdate(secret as kind.Secret);
      await startupCleanupQueue;

      expect(utils.cleanupOverClaimedControllerFields).toHaveBeenCalledWith(
        "default",
        expect.any(Array),
        expect.anything(),
      );
      expect(utils.reloadPods).not.toHaveBeenCalled();
    });

    it("should set the SSA cleanup annotation after first-observation cleanup when annotations exist", async () => {
      const secret = {
        metadata: {
          name: "test-secret",
          namespace: "default",
          annotations: { "existing.annotation/key": "value" },
        },
        data: { key: "dmFsdWU=" },
      };

      await handleSecretUpdate(secret as kind.Secret);
      await startupCleanupQueue;

      // Annotation is set via JSON Patch (not SSA Apply) to avoid affecting field ownership.
      // When annotations already exist, only the single add op is needed.
      expect(mockPatch).toHaveBeenCalledWith([
        {
          op: "add",
          path: `/metadata/annotations/${SSA_CLEANUP_ANNOTATION.replace(/\//g, "~1")}`,
          value: "true",
        },
      ]);
    });

    it("should create the annotations map first when resource has no annotations", async () => {
      const secret = {
        metadata: { name: "test-secret", namespace: "default" },
        data: { key: "dmFsdWU=" },
        // No annotations field — patch would fail without first creating the map
      };

      await handleSecretUpdate(secret as kind.Secret);
      await startupCleanupQueue;

      expect(mockPatch).toHaveBeenCalledWith([
        { op: "add", path: "/metadata/annotations", value: {} },
        {
          op: "add",
          path: `/metadata/annotations/${SSA_CLEANUP_ANNOTATION.replace(/\//g, "~1")}`,
          value: "true",
        },
      ]);
    });

    it("should skip cleanup on first observation when SSA cleanup annotation is already set", async () => {
      const secret = {
        metadata: {
          name: "test-secret",
          namespace: "default",
          annotations: { [SSA_CLEANUP_ANNOTATION]: "true" },
        },
        data: { key: "dmFsdWU=" },
      };

      await handleSecretUpdate(secret as kind.Secret);

      expect(utils.cleanupOverClaimedControllerFields).not.toHaveBeenCalled();
      expect(utils.reloadPods).not.toHaveBeenCalled();
    });

    it("keeps an invalid selector pending without rotating pods", async () => {
      // First, create a secret with valid data to set the initial checksum
      const initialSecret = {
        metadata: {
          name: "test-secret",
          namespace: "default",
          labels: {
            "uds.dev/pod-reload": "true",
          },
          annotations: {
            "uds.dev/pod-reload-selector": "app:invalid-format",
          },
        },
        data: {
          username: "dXNlcm5hbWU=",
          password: "cGFzc3dvcmQ=",
        },
      };

      // Process the initial secret to set the checksum
      await handleSecretUpdate(initialSecret as kind.Secret);

      // Clear mocks to prepare for the actual test
      vi.clearAllMocks();

      // Update the secret with invalid selector format and new data
      const updatedSecret = {
        ...initialSecret,
        data: {
          ...initialSecret.data,
          username: "bmV3LXVzZXJuYW1l", // new-username
        },
      };

      // Process the updated secret
      await expect(handleSecretUpdate(updatedSecret as kind.Secret)).rejects.toThrow(
        "Invalid selector format",
      );

      // Verify that the function doesn't call reloadPods
      expect(utils.reloadPods).not.toHaveBeenCalled();
      expect(secretReloadStateCache.get("default/test-secret")?.status).toBe("updating");

      // Verify error log for invalid selector format
      expect(mockError).toHaveBeenCalledWith(
        {
          resource: "test-secret",
          namespace: "default",
          selector: "app:invalid-format",
          type: "Secret",
        },
        expect.stringContaining(
          "Invalid selector format in uds.dev/pod-reload-selector annotation for secret",
        ),
      );
    });

    it("should only reload pods that match the selector when data changes", async () => {
      // The matching pod with correct label
      const matchingPod = {
        metadata: {
          name: "pod1",
          namespace: "default",
          labels: { app: "test-app" }, // This pod matches the selector
        },
      };

      // Setup K8s mock with our matching pod
      setupK8sMock({ items: [matchingPod] });

      // Mock reloadPods
      vi.mocked(utils.reloadPods).mockResolvedValue();

      // First secret with initial data
      const secret1 = {
        metadata: {
          name: "test-secret",
          namespace: "default",
          labels: {
            "uds.dev/pod-reload": "true",
          },
          annotations: {
            "uds.dev/pod-reload-selector": "app=test-app",
          },
        },
        data: {
          username: "dXNlcm5hbWU=", // base64 'username'
          password: "cGFzc3dvcmQ=", // base64 'password'
        },
      };

      // Second secret with changed data
      const secret2 = {
        ...secret1,
        data: {
          username: "dXNlcm5hbWU=", // base64 'username'
          password: "bmV3cGFzc3dvcmQ=", // base64 'newpassword'
        },
      };

      // First call should cache the checksum without rotating
      await handleSecretUpdate(secret1 as kind.Secret);
      expect(utils.reloadPods).not.toHaveBeenCalled();
      vi.clearAllMocks(); // Clear mock call history

      // Reset our mocks for the second call with the same pod
      setupK8sMock({ items: [matchingPod] });

      // Second call with changed data should reload pods
      await handleSecretUpdate(secret2 as kind.Secret);

      // Verify log messages
      expect(mockInfo).toHaveBeenCalledWith(
        { resource: "test-secret", namespace: "default", type: "Secret" },
        "Secret data changed, processing pod reload",
      );

      expect(mockDebug).toHaveBeenCalledWith(
        {
          resource: "test-secret",
          namespace: "default",
          selector: { app: "test-app" },
          type: "Secret",
        },
        "Using explicit pod selector from secret annotation for reload",
      );

      // Verify the correct namespace was used
      expect(mockInNamespace).toHaveBeenCalledWith("default");

      // Verify WithLabel was called with the correct selector
      expect(mockWithLabel).toHaveBeenCalledWith("app", "test-app");

      // Verify rotation was called with only the matching pod
      expect(utils.reloadPods).toHaveBeenCalledWith(
        "default",
        [matchingPod], // Only the matching pod should be passed
        "Secret test-secret change",
        expect.anything(),
        "SecretChanged",
      );
    });

    it("should handle multiple selectors when data changes", async () => {
      // The matching pod with correct labels
      const matchingPod = {
        metadata: {
          name: "pod1",
          namespace: "default",
          labels: {
            app: "test-app",
            tier: "frontend",
            env: "prod",
          },
        },
      };

      // Setup K8s mock with our matching pod
      setupK8sMock({
        items: [matchingPod],
      });

      // Mock reloadPods
      vi.mocked(utils.reloadPods).mockResolvedValue();

      // Secret with multiple selectors
      const secret1 = {
        metadata: {
          name: "multi-selector-secret",
          namespace: "default",
          labels: {
            "uds.dev/pod-reload": "true",
          },
          annotations: {
            "uds.dev/pod-reload-selector": "app=test-app,tier=frontend,env=prod",
          },
        },
        data: {
          username: "dXNlcm5hbWU=", // base64 'username'
          password: "cGFzc3dvcmQ=", // base64 'password'
        },
      };

      // Changed secret data
      const secret2 = {
        ...secret1,
        data: {
          username: "dXNlcm5hbWU=",
          password: "bmV3cGFzc3dvcmQ=", // changed password
        },
      };

      // First call caches the checksum
      await handleSecretUpdate(secret1 as kind.Secret);
      expect(utils.reloadPods).not.toHaveBeenCalled();
      vi.clearAllMocks();

      // Reset mocks for second call with the same pod
      setupK8sMock({ items: [matchingPod] });

      // Second call should reload pods
      await handleSecretUpdate(secret2 as kind.Secret);

      // Verify log messages
      expect(mockInfo).toHaveBeenCalledWith(
        { resource: "multi-selector-secret", namespace: "default", type: "Secret" },
        "Secret data changed, processing pod reload",
      );

      expect(mockDebug).toHaveBeenCalledWith(
        {
          resource: "multi-selector-secret",
          namespace: "default",
          selector: {
            app: "test-app",
            tier: "frontend",
            env: "prod",
          },
          type: "Secret",
        },
        "Using explicit pod selector from secret annotation for reload",
      );

      // Verify namespace was set correctly
      expect(mockInNamespace).toHaveBeenCalledWith("default");

      // Verify all three selectors were applied
      expect(mockWithLabel).toHaveBeenCalledWith("app", "test-app");
      expect(mockWithLabel).toHaveBeenCalledWith("tier", "frontend");
      expect(mockWithLabel).toHaveBeenCalledWith("env", "prod");

      // Verify rotation was called with only the matching pod
      expect(utils.reloadPods).toHaveBeenCalledWith(
        "default",
        [matchingPod],
        "Secret multi-selector-secret change",
        expect.anything(),
        "SecretChanged",
      );
    });

    it("should auto-discover pods consuming the secret", async () => {
      // Mock pods with volumes and env vars
      const mockPods = {
        items: [
          {
            metadata: { name: "pod1", namespace: "default" },
            spec: {
              volumes: [{ name: "secret-volume", secret: { secretName: "test-secret" } }],
            },
          },
          {
            metadata: { name: "pod2", namespace: "default" },
            spec: {
              containers: [
                {
                  env: [
                    {
                      name: "DB_PASSWORD",
                      valueFrom: { secretKeyRef: { name: "test-secret", key: "password" } },
                    },
                  ],
                },
              ],
            },
          },
          // Pod not using the secret
          {
            metadata: { name: "pod3", namespace: "default" },
            spec: {},
          },
        ],
      };

      // Secret with auto-discovery enabled
      const secret1 = {
        metadata: {
          name: "test-secret",
          namespace: "default",
          labels: {
            "uds.dev/pod-reload": "true",
          },
        },
        data: {
          username: "dXNlcm5hbWU=",
          password: "cGFzc3dvcmQ=",
        },
      };

      // Secret with changed data
      const secret2 = {
        ...secret1,
        data: {
          username: "dXNlcm5hbWU=",
          password: "bmV3cGFzc3dvcmQ=",
        },
      };

      // Setup K8s mock with custom response
      setupK8sMock(mockPods);

      // First call should cache the checksum without rotating
      await handleSecretUpdate(secret1 as kind.Secret);
      expect(utils.reloadPods).not.toHaveBeenCalled();
      vi.clearAllMocks(); // Clear mock call history

      // Second call with changed data should reload only the pods using the secret
      await handleSecretUpdate(secret2 as kind.Secret);

      // Verify log messages for auto-discovery
      expect(mockInfo).toHaveBeenCalledWith(
        { resource: "test-secret", namespace: "default", type: "Secret" },
        "Secret data changed, processing pod reload",
      );

      expect(mockDebug).toHaveBeenCalledWith(
        { resource: "test-secret", namespace: "default", type: "Secret" },
        "Auto-discovering secret consumers",
      );

      // Verify reloadPods was called with the correct parameters
      expect(utils.reloadPods).toHaveBeenCalledTimes(1);

      // Verify the final info log with pod count
      expect(mockInfo).toHaveBeenCalledWith(
        { resource: "test-secret", namespace: "default", podCount: 2, type: "Secret" },
        "Reloading 2 pods due to secret change",
      );

      // Check that the namespace and reason are correct
      const reloadPodCalls = vi.mocked(utils.reloadPods).mock.calls[0];
      expect(reloadPodCalls[0]).toBe("default"); // namespace
      expect(reloadPodCalls[2]).toBe("Secret test-secret change"); // reason

      // Verify pods 1 and 2 were included and pod3 is NOT included
      const reloaddPods = reloadPodCalls[1] as kind.Pod[];
      expect(reloaddPods.length).toBe(2);
      expect(reloaddPods.some(pod => pod.metadata?.name === "pod1")).toBe(true);
      expect(reloaddPods.some(pod => pod.metadata?.name === "pod2")).toBe(true);
      expect(reloaddPods.some(pod => pod.metadata?.name === "pod3")).toBe(false);
    });
  });

  describe("handleSecretDelete", () => {
    it("should clean up the cache when a secret is deleted", async () => {
      // Setup a secret and update it first to add to cache
      const secret = {
        metadata: {
          name: "test-secret",
          namespace: "default",
        },
        data: {
          username: "dXNlcm5hbWU=",
          password: "cGFzc3dvcmQ=",
        },
      };

      // First add to cache
      await handleSecretUpdate(secret as kind.Secret);

      // Then delete it
      await handleSecretDelete(secret as kind.Secret);

      // Verify it was removed from cache by updating it again
      // which should not trigger rotation because cache was cleared
      await handleSecretUpdate(secret as kind.Secret);
      expect(utils.reloadPods).not.toHaveBeenCalled();
    });
  });

  describe("parseSelectorString", () => {
    it("should parse valid key=value format", () => {
      const validSelector = "app=test-app";
      const result = parseSelectorString(validSelector);
      expect(result).toEqual({ app: "test-app" });
    });

    it("should parse multiple key=value pairs", () => {
      const validSelector = "app=test-app,component=api";
      const result = parseSelectorString(validSelector);
      expect(result).toEqual({ app: "test-app", component: "api" });
    });

    it("should handle whitespace in selector", () => {
      const validSelector = " app = test-app , component = api ";
      const result = parseSelectorString(validSelector);
      expect(result).toEqual({ app: "test-app", component: "api" });
    });

    it("should return null for invalid format", () => {
      const invalidSelector = "app:test-app";
      const result = parseSelectorString(invalidSelector);
      expect(result).toBeNull();
    });
  });

  describe("discoverSecretConsumers", () => {
    const secretName = "test-secret";
    const namespace = "test-ns";

    // Mock the K8s API
    const mockPods: { items: kind.Pod[] } = {
      items: [],
    };

    beforeEach(() => {
      setupK8sMock(mockPods);
    });

    it("should return empty array when no pods exist", async () => {
      mockPods.items = [];
      const result = await discoverSecretConsumers(namespace, secretName);
      expect(result).toEqual([]);
    });

    it("should find pods with direct secret volumes", async () => {
      mockPods.items = [
        {
          metadata: { name: "pod-with-secret-volume" },
          spec: {
            volumes: [{ name: "secret-vol", secret: { secretName } }],
          },
        } as kind.Pod,
        {
          metadata: { name: "pod-without-secret" },
          spec: {
            volumes: [{ name: "config", configMap: { name: "config-map" } }],
          },
        } as kind.Pod,
      ];

      const result = await discoverSecretConsumers(namespace, secretName);
      expect(result).toHaveLength(1);
      expect(result[0]?.metadata?.name).toBe("pod-with-secret-volume");
    });

    it("should find pods with projected volumes containing the secret", async () => {
      mockPods.items = [
        {
          metadata: { name: "pod-with-projected-secret" },
          spec: {
            volumes: [
              {
                name: "projected-vol",
                projected: {
                  sources: [
                    { secret: { name: secretName } },
                    { configMap: { name: "some-config" } },
                  ],
                },
              },
            ],
          },
        } as kind.Pod,
      ];

      const result = await discoverSecretConsumers(namespace, secretName);
      expect(result).toHaveLength(1);
      expect(result[0]?.metadata?.name).toBe("pod-with-projected-secret");
    });

    it("should find pods with environment variables from the secret", async () => {
      mockPods.items = [
        {
          metadata: { name: "pod-with-secret-env" },
          spec: {
            containers: [
              {
                env: [
                  {
                    name: "SECRET_VAR",
                    valueFrom: { secretKeyRef: { name: secretName, key: "key" } },
                  },
                ],
              },
            ],
          },
        } as kind.Pod,
      ];

      const result = await discoverSecretConsumers(namespace, secretName);
      expect(result).toHaveLength(1);
      expect(result[0]?.metadata?.name).toBe("pod-with-secret-env");
    });

    it("should find pods with environment variables from secret references", async () => {
      mockPods.items = [
        {
          metadata: { name: "pod-with-secret-envfrom" },
          spec: {
            containers: [
              {
                envFrom: [{ secretRef: { name: secretName } }],
              },
            ],
          },
        } as kind.Pod,
      ];

      const result = await discoverSecretConsumers(namespace, secretName);
      expect(result).toHaveLength(1);
      expect(result[0]?.metadata?.name).toBe("pod-with-secret-envfrom");
    });

    it("should check initContainers for secret usage", async () => {
      mockPods.items = [
        {
          metadata: { name: "pod-with-init-container" },
          spec: {
            initContainers: [
              {
                name: "init",
                env: [
                  {
                    name: "INIT_SECRET",
                    valueFrom: { secretKeyRef: { name: secretName, key: "key" } },
                  },
                ],
              },
            ],
            containers: [],
          },
        } as kind.Pod,
      ];

      const result = await discoverSecretConsumers(namespace, secretName);
      expect(result).toHaveLength(1);
      expect(result[0]?.metadata?.name).toBe("pod-with-init-container");
    });

    it("should handle pods with no spec", async () => {
      mockPods.items = [
        {
          metadata: { name: "pod-without-spec" },
          // No spec
        } as kind.Pod,
      ];

      const result = await discoverSecretConsumers(namespace, secretName);
      expect(result).toHaveLength(0);
    });
  });

  describe("handleConfigMapUpdate", () => {
    it("should do nothing if ConfigMap is missing metadata or data", async () => {
      // Missing metadata
      await handleConfigMapUpdate({} as kind.ConfigMap);
      expect(utils.reloadPods).not.toHaveBeenCalled();

      // Missing name
      await handleConfigMapUpdate({ metadata: {} } as kind.ConfigMap);
      expect(utils.reloadPods).not.toHaveBeenCalled();

      // Missing namespace
      await handleConfigMapUpdate({ metadata: { name: "test-configmap" } } as kind.ConfigMap);
      expect(utils.reloadPods).not.toHaveBeenCalled();

      // Missing data
      await handleConfigMapUpdate({
        metadata: { name: "test-configmap", namespace: "default" },
      } as kind.ConfigMap);
      expect(utils.reloadPods).not.toHaveBeenCalled();
    });

    it("should not reload pods if the checksum has not changed", async () => {
      // Setup a ConfigMap with metadata and data
      const configMap = {
        metadata: {
          name: "test-configmap",
          namespace: "default",
        },
        data: {
          "config.yaml": "key: value",
          "settings.json": '{"enabled": true}',
        },
      };

      // First call should cache the checksum
      await handleConfigMapUpdate(configMap as kind.ConfigMap);
      expect(utils.reloadPods).not.toHaveBeenCalled();

      // Second call with the same data should not reload pods
      await handleConfigMapUpdate(configMap as kind.ConfigMap);
      expect(utils.reloadPods).not.toHaveBeenCalled();
    });

    it("should only reload pods that match the selector when data changes", async () => {
      // The matching pod with correct label
      const matchingPod = {
        metadata: {
          name: "pod1",
          namespace: "default",
          labels: { app: "test-app" }, // This pod matches the selector
        },
      };

      // Setup K8s mock with our matching pod
      setupK8sMock({ items: [matchingPod] });

      // Mock reloadPods
      vi.mocked(utils.reloadPods).mockResolvedValue();

      // First ConfigMap with initial data
      const configMap1 = {
        metadata: {
          name: "test-configmap",
          namespace: "default",
          labels: {
            "uds.dev/pod-reload": "true",
          },
          annotations: {
            "uds.dev/pod-reload-selector": "app=test-app",
          },
        },
        data: {
          "config.yaml": "key: value",
          "settings.json": '{"enabled": true}',
        },
      };

      // Second ConfigMap with changed data
      const configMap2 = {
        ...configMap1,
        data: {
          "config.yaml": "key: value",
          "settings.json": '{"enabled": false}', // Changed value
        },
      };

      // First call should cache the checksum without rotating
      await handleConfigMapUpdate(configMap1 as kind.ConfigMap);
      expect(utils.reloadPods).not.toHaveBeenCalled();
      vi.clearAllMocks(); // Clear mock call history

      // Reset our mocks for the second call with the same pod
      setupK8sMock({ items: [matchingPod] });

      // Second call with changed data should reload pods
      await handleConfigMapUpdate(configMap2 as kind.ConfigMap);

      // Verify log messages
      expect(mockInfo).toHaveBeenCalledWith(
        { resource: "test-configmap", namespace: "default", type: "ConfigMap" },
        "ConfigMap data changed, processing pod reload",
      );

      expect(mockDebug).toHaveBeenCalledWith(
        {
          resource: "test-configmap",
          namespace: "default",
          selector: { app: "test-app" },
          type: "ConfigMap",
        },
        "Using explicit pod selector from configmap annotation for reload",
      );

      // Verify the correct namespace was used
      expect(mockInNamespace).toHaveBeenCalledWith("default");

      // Verify WithLabel was called with the correct selector
      expect(mockWithLabel).toHaveBeenCalledWith("app", "test-app");

      // Verify rotation was called with only the matching pod
      expect(utils.reloadPods).toHaveBeenCalledWith(
        "default",
        [matchingPod], // Only the matching pod should be passed
        "ConfigMap test-configmap change",
        expect.anything(),
        "ConfigMapChanged",
      );
    });
  });

  describe("handleConfigMapDelete", () => {
    it("should clean up the cache when a ConfigMap is deleted", async () => {
      // Setup a ConfigMap and update it first to add to cache
      const configMap = {
        metadata: {
          name: "test-configmap",
          namespace: "default",
        },
        data: {
          "config.yaml": "key: value",
        },
      };

      // First add to cache
      await handleConfigMapUpdate(configMap as kind.ConfigMap);

      // Then delete it
      await handleConfigMapDelete(configMap as kind.ConfigMap);

      // Verify it was removed from cache by updating it again
      // which should not trigger rotation because cache was cleared
      await handleConfigMapUpdate(configMap as kind.ConfigMap);
      expect(utils.reloadPods).not.toHaveBeenCalled();
    });
  });

  describe("discoverConfigMapConsumers", () => {
    const configMapName = "test-configmap";
    const namespace = "test-ns";

    // Mock the K8s API
    const mockPods: { items: kind.Pod[] } = {
      items: [],
    };

    beforeEach(() => {
      setupK8sMock(mockPods);
    });

    it("should return empty array when no pods exist", async () => {
      mockPods.items = [];
      const result = await discoverConfigMapConsumers(namespace, configMapName);
      expect(result).toEqual([]);
    });

    it("should find pods with direct ConfigMap volumes", async () => {
      mockPods.items = [
        {
          metadata: { name: "pod-with-configmap-volume" },
          spec: {
            volumes: [{ name: "config-vol", configMap: { name: configMapName } }],
          },
        } as kind.Pod,
        {
          metadata: { name: "pod-without-configmap" },
          spec: {
            volumes: [{ name: "secret-vol", secret: { secretName: "some-secret" } }],
          },
        } as kind.Pod,
      ];

      const result = await discoverConfigMapConsumers(namespace, configMapName);
      expect(result).toHaveLength(1);
      expect(result[0]?.metadata?.name).toBe("pod-with-configmap-volume");
    });

    it("should find pods with projected volumes containing the ConfigMap", async () => {
      mockPods.items = [
        {
          metadata: { name: "pod-with-projected-configmap" },
          spec: {
            volumes: [
              {
                name: "projected-vol",
                projected: {
                  sources: [
                    { configMap: { name: configMapName } },
                    { secret: { name: "some-secret" } },
                  ],
                },
              },
            ],
          },
        } as kind.Pod,
      ];

      const result = await discoverConfigMapConsumers(namespace, configMapName);
      expect(result).toHaveLength(1);
      expect(result[0]?.metadata?.name).toBe("pod-with-projected-configmap");
    });

    it("should find pods with environment variables from the ConfigMap", async () => {
      mockPods.items = [
        {
          metadata: { name: "pod-with-configmap-env" },
          spec: {
            containers: [
              {
                env: [
                  {
                    name: "CONFIG_VAR",
                    valueFrom: { configMapKeyRef: { name: configMapName, key: "key" } },
                  },
                ],
              },
            ],
          },
        } as kind.Pod,
      ];

      const result = await discoverConfigMapConsumers(namespace, configMapName);
      expect(result).toHaveLength(1);
      expect(result[0]?.metadata?.name).toBe("pod-with-configmap-env");
    });

    it("should find pods with environment variables from ConfigMap references", async () => {
      mockPods.items = [
        {
          metadata: { name: "pod-with-configmap-envfrom" },
          spec: {
            containers: [
              {
                envFrom: [{ configMapRef: { name: configMapName } }],
              },
            ],
          },
        } as kind.Pod,
      ];

      const result = await discoverConfigMapConsumers(namespace, configMapName);
      expect(result).toHaveLength(1);
      expect(result[0]?.metadata?.name).toBe("pod-with-configmap-envfrom");
    });
  });

  describe("resource creation for optional mounts", () => {
    const namespace = "default";
    const resourceName = "late-config";
    const beforeResource = "2026-09-30T10:00:00Z";
    const resourceCreated = "2026-09-30T10:05:00Z";
    const afterResource = "2026-09-30T10:10:00Z";

    function pod(
      name: string,
      volumes: NonNullable<kind.Pod["spec"]>["volumes"],
      created = beforeResource,
    ) {
      return {
        metadata: { name, namespace, creationTimestamp: created },
        status: { phase: "Running", startTime: created },
        spec: {
          containers: [
            {
              name: "app",
              image: "example:latest",
              volumeMounts: [{ name: "config", mountPath: "/config" }],
            },
          ],
          volumes,
        },
      } as unknown as kind.Pod;
    }

    function secret(created = resourceCreated) {
      return {
        metadata: {
          name: resourceName,
          namespace,
          creationTimestamp: created,
          labels: { "uds.dev/pod-reload": "true" },
        },
        data: { key: "dmFsdWU=" },
      } as unknown as kind.Secret;
    }

    function configMap(created = resourceCreated) {
      return {
        metadata: {
          name: resourceName,
          namespace,
          creationTimestamp: created,
          labels: { "uds.dev/pod-reload": "true" },
        },
        data: { key: "value" },
      } as unknown as kind.ConfigMap;
    }

    it("reloads only older pods with a matching optional Secret volume", async () => {
      const affected = pod("affected", [
        { name: "config", secret: { secretName: resourceName, optional: true } },
      ]);
      setupK8sMock({
        items: [
          affected,
          pod("required", [{ name: "config", secret: { secretName: resourceName } }]),
          pod("other-secret", [
            { name: "config", secret: { secretName: "other", optional: true } },
          ]),
          pod("required-projected-secret", [
            { name: "config", projected: { sources: [{ secret: { name: resourceName } }] } },
          ]),
          pod(
            "started-after-creation",
            [{ name: "config", secret: { secretName: resourceName, optional: true } }],
            afterResource,
          ),
          {
            metadata: {
              name: "optional-env-only",
              namespace,
              creationTimestamp: new Date(beforeResource),
            },
            spec: {
              containers: [
                {
                  name: "app",
                  env: [
                    {
                      name: "KEY",
                      valueFrom: {
                        secretKeyRef: { name: resourceName, key: "key", optional: true },
                      },
                    },
                  ],
                },
              ],
            },
          } as kind.Pod,
        ],
      });

      await handleSecretUpdate(secret());
      await startupCleanupQueue;

      expect(utils.reloadPods).toHaveBeenCalledWith(
        namespace,
        [affected],
        expect.any(String),
        expect.anything(),
        expect.any(String),
      );
      expect(utils.reloadPods).toHaveBeenCalledTimes(1);
    });

    it("reloads an older pod with a matching optional ConfigMap volume", async () => {
      const affected = pod("affected", [
        { name: "config", configMap: { name: resourceName, optional: true } },
      ]);
      setupK8sMock({ items: [affected] });

      await handleConfigMapUpdate(configMap());
      await startupCleanupQueue;

      expect(utils.reloadPods).toHaveBeenCalledWith(
        namespace,
        [affected],
        expect.any(String),
        expect.anything(),
        expect.any(String),
      );
    });

    it("reloads an older pod with a matching optional projected Secret", async () => {
      const affected = pod("affected", [
        {
          name: "config",
          projected: { sources: [{ secret: { name: resourceName, optional: true } }] },
        },
      ]);
      setupK8sMock({ items: [affected] });

      await handleSecretUpdate(secret());
      await startupCleanupQueue;

      expect(utils.reloadPods).toHaveBeenCalledWith(
        namespace,
        [affected],
        expect.any(String),
        expect.anything(),
        expect.any(String),
      );
    });

    it("reloads an older pod with a matching optional projected ConfigMap", async () => {
      const affected = pod("affected", [
        {
          name: "config",
          projected: { sources: [{ configMap: { name: resourceName, optional: true } }] },
        },
      ]);
      setupK8sMock({ items: [affected] });

      await handleConfigMapUpdate(configMap());
      await startupCleanupQueue;

      expect(utils.reloadPods).toHaveBeenCalledWith(
        namespace,
        [affected],
        expect.any(String),
        expect.anything(),
        expect.any(String),
      );
    });

    it("does not reload a pod created after the resource already existed", async () => {
      setupK8sMock({
        items: [
          pod(
            "new-pod",
            [{ name: "config", secret: { secretName: resourceName, optional: true } }],
            afterResource,
          ),
        ],
      });

      await handleSecretUpdate(secret());
      await startupCleanupQueue;

      expect(utils.reloadPods).not.toHaveBeenCalled();
    });

    it("reloads an optional mount when pod start and Secret creation share a timestamp", async () => {
      const affected = pod(
        "same-second-pod",
        [{ name: "config", secret: { secretName: resourceName, optional: true } }],
        resourceCreated,
      );
      setupK8sMock({ items: [affected] });

      await handleSecretUpdate(secret());

      expect(vi.mocked(utils.reloadPods).mock.calls[0]?.[1]).toEqual([affected]);
    });

    it("does not confuse the cleanup annotation with a completed creation reload", async () => {
      const affected = pod("affected", [
        { name: "config", secret: { secretName: resourceName, optional: true } },
      ]);
      setupK8sMock({ items: [affected] });
      const createdSecret = secret();
      createdSecret.metadata!.annotations = { [SSA_CLEANUP_ANNOTATION]: "true" };

      await handleSecretUpdate(createdSecret);

      expect(utils.cleanupOverClaimedControllerFields).not.toHaveBeenCalled();
      expect(utils.reloadPods).toHaveBeenCalledTimes(1);
    });

    it("does not reload the same pod twice for repeated observations of the resource", async () => {
      const affected = pod("affected", [
        { name: "config", secret: { secretName: resourceName, optional: true } },
      ]);
      setupK8sMock({ items: [affected] });
      const createdSecret = secret();

      await handleSecretUpdate(createdSecret);
      await startupCleanupQueue;
      await handleSecretUpdate(createdSecret);

      expect(utils.reloadPods).toHaveBeenCalledTimes(1);
    });

    it("reloads after deletion and recreation when the pod predates the new Secret", async () => {
      const affected = pod("affected", [
        { name: "config", secret: { secretName: resourceName, optional: true } },
      ]);
      setupK8sMock({ items: [affected] });
      const original = secret("2026-09-30T09:00:00Z");

      await handleSecretUpdate(original);
      await startupCleanupQueue;
      expect(utils.reloadPods).not.toHaveBeenCalled();

      handleSecretDelete(original);
      await handleSecretUpdate(secret());
      await startupCleanupQueue;

      expect(utils.reloadPods).toHaveBeenCalledTimes(1);
    });

    it("waits for first-observation cleanup before reloading", async () => {
      const affected = pod("affected", [
        { name: "config", secret: { secretName: resourceName, optional: true } },
      ]);
      setupK8sMock({ items: [affected] });
      let finishCleanup: (() => void) | undefined;
      vi.mocked(utils.cleanupOverClaimedControllerFields).mockImplementation(
        () =>
          new Promise<void>(resolve => {
            finishCleanup = resolve;
          }),
      );

      const observation = handleSecretUpdate(secret());
      await vi.waitFor(() => expect(finishCleanup).toBeDefined());
      expect(utils.reloadPods).not.toHaveBeenCalled();
      finishCleanup?.();
      await observation;
      await startupCleanupQueue;

      expect(utils.reloadPods).toHaveBeenCalledTimes(1);
    });

    it("can retry a creation reload after a transient failure", async () => {
      const affected = pod("affected", [
        { name: "config", secret: { secretName: resourceName, optional: true } },
      ]);
      setupK8sMock({ items: [affected] });
      vi.mocked(utils.reloadPods).mockRejectedValueOnce(new Error("temporary failure"));
      const createdSecret = secret();

      await expect(handleSecretUpdate(createdSecret)).rejects.toThrow("temporary failure");
      await startupCleanupQueue;
      await handleSecretUpdate(createdSecret);

      expect(utils.reloadPods).toHaveBeenCalledTimes(2);
    });

    it("combines a pending creation retry with targets of a later data update", async () => {
      const oldPod = pod("old-optional", [
        { name: "config", secret: { secretName: resourceName, optional: true } },
      ]);
      const newerPod = pod(
        "newer-selected",
        [{ name: "config", secret: { secretName: resourceName } }],
        afterResource,
      );
      setupK8sMock({ items: [oldPod, newerPod] });
      mockGet
        .mockResolvedValueOnce({ items: [oldPod, newerPod] })
        .mockResolvedValueOnce({ items: [oldPod, newerPod] })
        .mockResolvedValueOnce({ items: [newerPod] });
      const createdSecret = secret();
      createdSecret.metadata!.annotations = {
        [SSA_CLEANUP_ANNOTATION]: "true",
        "uds.dev/pod-reload-selector": "app=newer",
      };
      vi.mocked(utils.reloadPods).mockRejectedValueOnce(new Error("temporary failure"));

      await expect(handleSecretUpdate(createdSecret)).rejects.toThrow("temporary failure");
      const updatedSecret = { ...createdSecret, data: { key: "bmV3" } } as kind.Secret;
      await handleSecretUpdate(updatedSecret);

      expect(utils.reloadPods).toHaveBeenCalledTimes(2);
      expect(vi.mocked(utils.reloadPods).mock.calls[1]?.[1]).toEqual([oldPod, newerPod]);
      expect(secretReloadStateCache.get(`${namespace}/${resourceName}`)).toEqual({
        checksum: computeResourceChecksum(updatedSecret.data!),
        status: "complete",
      });
    });

    it("retries creation pods even when an updated resource has an invalid selector", async () => {
      const affected = pod("old-optional", [
        { name: "config", secret: { secretName: resourceName, optional: true } },
      ]);
      setupK8sMock({ items: [affected] });
      const createdSecret = secret();
      createdSecret.metadata!.annotations = {
        [SSA_CLEANUP_ANNOTATION]: "true",
        "uds.dev/pod-reload-selector": "app:invalid",
      };
      vi.mocked(utils.reloadPods).mockRejectedValueOnce(new Error("creation reload failed"));

      await expect(handleSecretUpdate(createdSecret)).rejects.toThrow("creation reload failed");
      const updatedSecret = { ...createdSecret, data: { key: "bmV3" } } as kind.Secret;
      await expect(handleSecretUpdate(updatedSecret)).rejects.toThrow("Invalid selector format");

      expect(vi.mocked(utils.reloadPods).mock.calls[1]?.[1]).toEqual([affected]);
      expect(secretReloadStateCache.get(`${namespace}/${resourceName}`)).toEqual({
        checksum: computeResourceChecksum(updatedSecret.data!),
        status: "updating",
      });
    });

    it("does not reload an overlapping pod twice when creation and update targets combine", async () => {
      const affected = pod("affected", [
        { name: "config", secret: { secretName: resourceName, optional: true } },
      ]);
      setupK8sMock({ items: [affected] });
      const createdSecret = secret();
      createdSecret.metadata!.annotations = {
        [SSA_CLEANUP_ANNOTATION]: "true",
        "uds.dev/pod-reload-selector": "app=affected",
      };
      vi.mocked(utils.reloadPods).mockRejectedValueOnce(new Error("temporary failure"));

      await expect(handleSecretUpdate(createdSecret)).rejects.toThrow("temporary failure");
      await handleSecretUpdate({ ...createdSecret, data: { key: "bmV3" } } as kind.Secret);

      expect(vi.mocked(utils.reloadPods).mock.calls[1]?.[1]).toEqual([affected]);
    });

    it("keeps both target groups pending when a combined reload fails and data reverts", async () => {
      const oldPod = pod("old-optional", [
        { name: "config", secret: { secretName: resourceName, optional: true } },
      ]);
      const newerPod = pod("newer-selected", [], afterResource);
      setupK8sMock({ items: [oldPod, newerPod] });
      mockGet
        .mockResolvedValueOnce({ items: [oldPod, newerPod] })
        .mockResolvedValueOnce({ items: [oldPod, newerPod] })
        .mockResolvedValueOnce({ items: [newerPod] })
        .mockResolvedValueOnce({ items: [oldPod, newerPod] })
        .mockResolvedValueOnce({ items: [newerPod] });
      const createdSecret = secret();
      createdSecret.metadata!.annotations = {
        [SSA_CLEANUP_ANNOTATION]: "true",
        "uds.dev/pod-reload-selector": "app=newer",
      };
      const updatedSecret = { ...createdSecret, data: { key: "bmV3" } } as kind.Secret;
      vi.mocked(utils.reloadPods)
        .mockRejectedValueOnce(new Error("creation failed"))
        .mockRejectedValueOnce(new Error("combined reload failed"));

      await expect(handleSecretUpdate(createdSecret)).rejects.toThrow("creation failed");
      await expect(handleSecretUpdate(updatedSecret)).rejects.toThrow("combined reload failed");
      expect(secretReloadStateCache.get(`${namespace}/${resourceName}`)?.status).toBe(
        "creationAndUpdatePending",
      );

      await handleSecretUpdate(createdSecret);

      expect(vi.mocked(utils.reloadPods).mock.calls[2]?.[1]).toEqual([oldPod, newerPod]);
      expect(secretReloadStateCache.get(`${namespace}/${resourceName}`)?.status).toBe("complete");
    });

    it("retries an old pod when its controller template was patched but eviction failed", async () => {
      const affected = pod("affected", [
        { name: "config", secret: { secretName: resourceName, optional: true } },
      ]);
      affected.metadata!.ownerReferences = [
        {
          apiVersion: "apps/v1",
          kind: "StatefulSet",
          name: "controller",
          uid: "owner",
          controller: true,
        },
      ];
      const createdSecret = secret();
      createdSecret.metadata!.annotations = { [SSA_CLEANUP_ANNOTATION]: "true" };
      setupK8sMock({ items: [affected] });
      vi.mocked(utils.resolveControllerKindAndName).mockResolvedValue({
        kindClass: kind.StatefulSet,
        name: "controller",
      });
      let templatePatched = false;
      mockGet.mockImplementation((name?: string) =>
        name
          ? Promise.resolve({
              spec: {
                template: {
                  metadata: {
                    annotations: templatePatched
                      ? { "uds.dev/restartedAt": "2026-09-30T10:06:00Z" }
                      : {},
                  },
                },
              },
            })
          : Promise.resolve({ items: [affected] }),
      );
      vi.mocked(utils.reloadPods).mockImplementationOnce(async () => {
        templatePatched = true;
        throw new Error("eviction failed");
      });

      await expect(handleSecretUpdate(createdSecret)).rejects.toThrow("eviction failed");
      await handleSecretUpdate(createdSecret);

      expect(utils.reloadPods).toHaveBeenCalledTimes(2);
    });

    it("retries an old OnDelete pod after a failed combined reload", async () => {
      const affected = pod("old-optional", [
        { name: "config", secret: { secretName: resourceName, optional: true } },
      ]);
      affected.metadata!.ownerReferences = [
        {
          apiVersion: "apps/v1",
          kind: "StatefulSet",
          name: "controller",
          uid: "owner",
          controller: true,
        },
      ];
      const selected = pod("newer-selected", [], afterResource);
      const allPods = { items: [affected, selected] };
      const controller = (restartedAt?: string) => ({
        spec: {
          updateStrategy: { type: "OnDelete" },
          template: {
            metadata: { annotations: restartedAt ? { "uds.dev/restartedAt": restartedAt } : {} },
          },
        },
      });
      setupK8sMock(allPods);
      mockGet
        .mockResolvedValueOnce(allPods)
        .mockResolvedValueOnce(controller())
        .mockResolvedValueOnce(allPods)
        .mockResolvedValueOnce(controller("2026-09-30T10:06:00Z"))
        .mockResolvedValueOnce({ items: [selected] })
        .mockResolvedValueOnce(allPods)
        .mockResolvedValueOnce(controller("2026-09-30T10:06:00Z"))
        .mockResolvedValueOnce({ items: [selected] });
      vi.mocked(utils.resolveControllerKindAndName).mockResolvedValue({
        kindClass: kind.StatefulSet,
        name: "controller",
      });
      vi.mocked(utils.reloadPods)
        .mockRejectedValueOnce(new Error("eviction failed"))
        .mockRejectedValueOnce(new Error("combined reload failed"));
      const createdSecret = secret();
      createdSecret.metadata!.annotations = {
        [SSA_CLEANUP_ANNOTATION]: "true",
        "uds.dev/pod-reload-selector": "app=newer",
      };
      const updatedSecret = { ...createdSecret, data: { key: "bmV3" } } as kind.Secret;

      await expect(handleSecretUpdate(createdSecret)).rejects.toThrow("eviction failed");
      await expect(handleSecretUpdate(updatedSecret)).rejects.toThrow("combined reload failed");
      await handleSecretUpdate(updatedSecret);

      expect(vi.mocked(utils.reloadPods).mock.calls[2]?.[1]).toEqual([affected, selected]);
      expect(secretReloadStateCache.get(`${namespace}/${resourceName}`)?.status).toBe("complete");
    });

    it("keeps the controller timestamp guard on first observation", async () => {
      const affected = pod("old-optional", [
        { name: "config", secret: { secretName: resourceName, optional: true } },
      ]);
      affected.metadata!.ownerReferences = [
        {
          apiVersion: "apps/v1",
          kind: "StatefulSet",
          name: "controller",
          uid: "owner",
          controller: true,
        },
      ];
      const createdSecret = secret();
      createdSecret.metadata!.annotations = { [SSA_CLEANUP_ANNOTATION]: "true" };
      setupK8sMock({ items: [affected] });
      vi.mocked(utils.resolveControllerKindAndName).mockResolvedValue({
        kindClass: kind.StatefulSet,
        name: "controller",
      });
      mockGet.mockImplementation((name?: string) =>
        name
          ? Promise.resolve({
              spec: {
                template: {
                  metadata: { annotations: { "uds.dev/restartedAt": "2026-09-30T10:06:00Z" } },
                },
              },
            })
          : Promise.resolve({ items: [affected] }),
      );

      await handleSecretUpdate(createdSecret);

      expect(utils.reloadPods).not.toHaveBeenCalled();
    });

    it("reloads when the controller restart and resource creation share a second", async () => {
      const affected = pod("old-optional", [
        { name: "config", secret: { secretName: resourceName, optional: true } },
      ]);
      affected.metadata!.ownerReferences = [
        {
          apiVersion: "apps/v1",
          kind: "StatefulSet",
          name: "controller",
          uid: "owner",
          controller: true,
        },
      ];
      const createdSecret = secret();
      createdSecret.metadata!.annotations = { [SSA_CLEANUP_ANNOTATION]: "true" };
      setupK8sMock({ items: [affected] });
      vi.mocked(utils.resolveControllerKindAndName).mockResolvedValue({
        kindClass: kind.StatefulSet,
        name: "controller",
      });
      mockGet.mockImplementation((name?: string) =>
        name
          ? Promise.resolve({
              spec: {
                template: {
                  metadata: { annotations: { "uds.dev/restartedAt": "2026-09-30T10:05:00.500Z" } },
                },
              },
            })
          : Promise.resolve({ items: [affected] }),
      );

      await handleSecretUpdate(createdSecret);

      expect(vi.mocked(utils.reloadPods).mock.calls[0]?.[1]).toEqual([affected]);
    });

    it("retries creation processing after pod discovery fails", async () => {
      const affected = pod("affected", [
        { name: "config", secret: { secretName: resourceName, optional: true } },
      ]);
      const createdSecret = secret();
      createdSecret.metadata!.annotations = { [SSA_CLEANUP_ANNOTATION]: "true" };
      setupK8sMock({ items: [affected] });
      mockGet.mockRejectedValueOnce(new Error("pod list unavailable"));

      await expect(handleSecretUpdate(createdSecret)).rejects.toThrow("pod list unavailable");
      expect(secretReloadStateCache.get(`${namespace}/${resourceName}`)?.status).toBe("creating");

      await handleSecretUpdate(createdSecret);
      expect(utils.reloadPods).toHaveBeenCalledTimes(1);
    });

    it("retries creation processing after controller lookup fails", async () => {
      const affected = pod("affected", [
        { name: "config", secret: { secretName: resourceName, optional: true } },
      ]);
      affected.metadata!.ownerReferences = [
        {
          apiVersion: "apps/v1",
          kind: "StatefulSet",
          name: "controller",
          uid: "owner",
          controller: true,
        },
      ];
      const createdSecret = secret();
      createdSecret.metadata!.annotations = { [SSA_CLEANUP_ANNOTATION]: "true" };
      setupK8sMock({ items: [affected] });
      vi.mocked(utils.resolveControllerKindAndName).mockResolvedValue({
        kindClass: kind.StatefulSet,
        name: "controller",
      });
      mockGet.mockImplementation((name?: string) =>
        name
          ? Promise.reject(new Error("controller unavailable"))
          : Promise.resolve({ items: [affected] }),
      );

      await expect(handleSecretUpdate(createdSecret)).rejects.toThrow("controller unavailable");
      expect(secretReloadStateCache.get(`${namespace}/${resourceName}`)?.status).toBe("creating");

      mockGet.mockImplementation((name?: string) =>
        name
          ? Promise.resolve({ spec: { template: { metadata: { annotations: {} } } } })
          : Promise.resolve({ items: [affected] }),
      );
      await handleSecretUpdate(createdSecret);
      expect(utils.reloadPods).toHaveBeenCalledTimes(1);
    });

    it("treats a new UID as creation even before the old deletion event arrives", async () => {
      const affected = pod("affected", [
        { name: "config", secret: { secretName: resourceName, optional: true } },
      ]);
      setupK8sMock({ items: [affected] });
      const oldSecret = secret("2026-09-30T09:00:00Z");
      oldSecret.metadata!.uid = "old-uid";
      oldSecret.metadata!.annotations = { [SSA_CLEANUP_ANNOTATION]: "true" };
      const newSecret = secret();
      newSecret.metadata!.uid = "new-uid";
      newSecret.metadata!.annotations = { [SSA_CLEANUP_ANNOTATION]: "true" };

      await handleSecretUpdate(oldSecret);
      expect(utils.reloadPods).not.toHaveBeenCalled();

      await handleSecretUpdate(newSecret);
      expect(utils.reloadPods).toHaveBeenCalledTimes(1);
      expect(secretReloadStateCache.get(`${namespace}/${resourceName}/new-uid`)?.status).toBe(
        "complete",
      );

      handleSecretDelete(oldSecret);
      expect(secretReloadStateCache.has(`${namespace}/${resourceName}/new-uid`)).toBe(true);
      await handleSecretUpdate(newSecret);
      expect(utils.reloadPods).toHaveBeenCalledTimes(1);
    });

    it("retries a creation reload after losing the in-memory cache", async () => {
      const affected = pod("affected", [
        { name: "config", secret: { secretName: resourceName, optional: true } },
      ]);
      setupK8sMock({ items: [affected] });
      const createdSecret = secret();
      createdSecret.metadata!.uid = "secret-uid";
      createdSecret.metadata!.annotations = { [SSA_CLEANUP_ANNOTATION]: "true" };
      vi.mocked(utils.reloadPods).mockRejectedValueOnce(new Error("operator stopped"));

      await expect(handleSecretUpdate(createdSecret)).rejects.toThrow("operator stopped");
      secretReloadStateCache.clear();
      await handleSecretUpdate(createdSecret);

      expect(utils.reloadPods).toHaveBeenCalledTimes(2);
    });
  });

  describe("failed data update retries", () => {
    const cacheKey = "default/late-config";
    const affected = {
      metadata: { name: "affected", namespace: "default" },
      status: { phase: "Running", startTime: "2026-09-30T10:10:00Z" },
      spec: {
        containers: [{ name: "app", image: "example:latest" }],
        volumes: [{ name: "config", configMap: { name: "late-config", optional: true } }],
      },
    } as unknown as kind.Pod;
    const original = {
      metadata: {
        name: "late-config",
        namespace: "default",
        creationTimestamp: "2026-09-30T10:05:00Z",
        annotations: { [SSA_CLEANUP_ANNOTATION]: "true" },
      },
      data: { key: "A" },
    } as unknown as kind.ConfigMap;
    const updated = { ...original, data: { key: "B" } } as kind.ConfigMap;

    beforeEach(async () => {
      setupK8sMock({ items: [affected] });
      await handleConfigMapUpdate(original);
      expect(utils.reloadPods).not.toHaveBeenCalled();
    });

    it("retries an unchanged value after a partial reload failure", async () => {
      vi.mocked(utils.reloadPods).mockRejectedValueOnce(new Error("one controller failed"));

      await expect(handleConfigMapUpdate(updated)).rejects.toThrow("one controller failed");
      expect(configMapReloadStateCache.get(cacheKey)?.checksum).toBe(
        computeResourceChecksum(updated.data!),
      );
      expect(configMapReloadStateCache.get(cacheKey)?.status).toBe("updating");

      await handleConfigMapUpdate(updated);
      await handleConfigMapUpdate(updated);

      expect(utils.reloadPods).toHaveBeenCalledTimes(2);
      expect(configMapReloadStateCache.get(cacheKey)?.status).toBe("complete");
    });

    it("reloads again when data reverts after a partial reload failure", async () => {
      vi.mocked(utils.reloadPods).mockRejectedValueOnce(new Error("one controller failed"));

      await expect(handleConfigMapUpdate(updated)).rejects.toThrow("one controller failed");
      await handleConfigMapUpdate(original);

      expect(utils.reloadPods).toHaveBeenCalledTimes(2);
      expect(vi.mocked(utils.reloadPods).mock.calls[1]?.[1]).toEqual([affected]);
      expect(configMapReloadStateCache.get(cacheKey)?.checksum).toBe(
        computeResourceChecksum(original.data!),
      );
      expect(configMapReloadStateCache.get(cacheKey)?.status).toBe("complete");
    });

    it("clears a pending reload when the resource is deleted", async () => {
      vi.mocked(utils.reloadPods).mockRejectedValueOnce(new Error("one controller failed"));

      await expect(handleConfigMapUpdate(updated)).rejects.toThrow("one controller failed");
      handleConfigMapDelete(updated);

      expect(configMapReloadStateCache.has(cacheKey)).toBe(false);
    });

    it("records pending state before attempting a data reload", async () => {
      vi.mocked(utils.reloadPods).mockImplementationOnce(async () => {
        expect(configMapReloadStateCache.get(cacheKey)?.status).toBe("updating");
      });

      await handleConfigMapUpdate(updated);

      expect(configMapReloadStateCache.get(cacheKey)?.status).toBe("complete");
      expect(mockPatch).not.toHaveBeenCalled();
    });
  });
});
