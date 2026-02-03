/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { K8s, kind } from "pepr";
import { afterEach, beforeEach, describe, expect, it, Mock, vi } from "vitest";
import {
  computeResourceChecksum,
  configMapChecksumCache,
  discoverConfigMapConsumers,
  discoverSecretConsumers,
  handleConfigMapDelete,
  handleConfigMapUpdate,
  handleSecretDelete,
  handleSecretUpdate,
  parseSelectorString,
} from "./pod-reload.js";
import * as utils from "./reload-utils.js";

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
    },
  };
});

vi.mock("./reload-utils", async () => {
  return {
    reloadPods: vi.fn(),
  };
});

// Import the caches directly
import { secretChecksumCache } from "./pod-reload.js";

describe("pod-reload", () => {
  // Clear the caches before each test
  beforeEach(() => {
    secretChecksumCache.clear();
    configMapChecksumCache.clear();
  });

  // Global mocks for K8s API
  const mockGet = vi.fn();
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
      Apply: vi.fn(),
      WithField: vi.fn().mockReturnThis(),
      Create: vi.fn(),
      Patch: vi.fn(),
      PatchStatus: vi.fn(),
      Raw: vi.fn(),
      Proxy: vi.fn(),
    };

    // Setup the K8s function mock
    vi.mocked(K8s as Mock).mockImplementation(() => mockK8sClient);
  }

  beforeEach(() => {
    vi.resetAllMocks();
    secretChecksumCache.clear();
    configMapChecksumCache.clear();

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

    it("should return early when the selector format is invalid without rotating pods", async () => {
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
      await handleSecretUpdate(updatedSecret as kind.Secret);

      // Verify that the function doesn't call reloadPods
      expect(utils.reloadPods).not.toHaveBeenCalled();

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
});
