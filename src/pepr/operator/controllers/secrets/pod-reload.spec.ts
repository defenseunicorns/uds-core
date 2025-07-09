/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { K8s, kind } from "pepr";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as utils from "../utils";
import {
  computeSecretChecksum,
  handleSecretDelete,
  handleSecretUpdate,
  parseSelectorString,
} from "./pod-reload";

// Mock the logger
vi.mock("../../../logger", () => ({
  Component: { OPERATOR_SECRETS: "OPERATOR_SECRETS" },
  setupLogger: vi.fn().mockReturnValue({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Mock dependencies
vi.mock("pepr", async importOriginal => {
  const originalModule = await importOriginal<typeof import("pepr")>();

  return {
    ...originalModule,
    K8s: vi.fn(),
    kind: {
      Pod: "Pod",
      Secret: "Secret",
    },
  };
});

vi.mock("../../../logger", () => ({
  setupLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  })),
  Component: {
    OPERATOR: "OPERATOR",
  },
}));

vi.mock("../utils", () => ({
  reloadPods: vi.fn(),
}));

// Import the secretChecksumCache directly
import { secretChecksumCache } from "./pod-reload";

describe("pod-reload", () => {
  // Mock K8s responses
  const mockGet = vi.fn();
  const mockWithLabel = vi.fn(() => ({ Get: mockGet }));
  const mockInNamespace = vi.fn(() => ({
    Get: mockGet,
    WithLabel: mockWithLabel,
  }));

  beforeEach(() => {
    vi.resetAllMocks();
    // Reset the secret checksum cache before each test
    secretChecksumCache.clear();

    // Setup K8s mocks with fluent API
    const mockK8s = vi.fn(() => ({
      InNamespace: mockInNamespace,
    }));

    (K8s as unknown as ReturnType<typeof vi.fn>).mockImplementation(mockK8s);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("computeSecretChecksum", () => {
    it("should compute consistent checksums for the same data", () => {
      const data1 = { key1: "value1", key2: "value2" };
      const data2 = { key2: "value2", key1: "value1" }; // Same data, different order

      const checksum1 = computeSecretChecksum(data1);
      const checksum2 = computeSecretChecksum(data2);

      expect(checksum1).toBeTruthy();
      expect(checksum2).toBeTruthy();
      expect(checksum1).toBe(checksum2);
    });

    it("should compute different checksums for different data", () => {
      const data1 = { key1: "value1", key2: "value2" };
      const data2 = { key1: "value1", key2: "different" };

      const checksum1 = computeSecretChecksum(data1);
      const checksum2 = computeSecretChecksum(data2);

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
      // Secret with invalid selector format
      const secret = {
        metadata: {
          name: "test-secret",
          namespace: "default",
          labels: {
            "uds.dev/pod-reload": "true",
          },
          annotations: {
            "uds.dev/pod-reload-selector": "app:invalid-format", // Invalid format (uses : instead of =)
          },
        },
        data: {
          username: "dXNlcm5hbWU=",
          password: "cGFzc3dvcmQ=",
        },
      };

      // Should complete without throwing
      await handleSecretUpdate(secret as kind.Secret);

      // Verify that the function returns early and doesn't call reloadPods
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

      // Mock the K8s API with chainable methods
      const mockWithLabel = vi.fn().mockReturnThis();
      const mockInNamespace = vi.fn().mockReturnThis();
      const mockGet = vi.fn().mockResolvedValue({
        items: [matchingPod], // Only return the matching pod
      });

      // Set up the K8s mock to return our chainable mock functions
      vi.mocked(K8s).mockImplementation(() => ({
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
      }));

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

      // Reset our mocks for the second call
      vi.mocked(K8s).mockImplementation(() => ({
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
      }));

      // Second call with changed data should reload pods
      await handleSecretUpdate(secret2 as kind.Secret);

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

      // Mock the K8s API with chainable methods
      const mockWithLabel = vi.fn().mockReturnThis();
      const mockInNamespace = vi.fn().mockReturnThis();
      const mockGet = vi.fn().mockResolvedValue({
        items: [matchingPod],
      });

      // Set up the K8s mock
      vi.mocked(K8s).mockImplementation(() => ({
        InNamespace: mockInNamespace,
        WithLabel: mockWithLabel,
        Get: mockGet,
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
      }));

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

      // Reset mocks for second call
      vi.mocked(K8s).mockImplementation(() => ({
        InNamespace: mockInNamespace,
        WithLabel: mockWithLabel,
        Get: mockGet,
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
      }));

      // Second call should reload pods
      await handleSecretUpdate(secret2 as kind.Secret);

      // Verify namespace was set correctly
      expect(mockInNamespace).toHaveBeenCalledWith("default");

      // Verify all three selectors were applied
      expect(mockWithLabel).toHaveBeenCalledWith("app", "test-app");
      expect(mockWithLabel).toHaveBeenCalledWith("tier", "frontend");
      expect(mockWithLabel).toHaveBeenCalledWith("env", "prod");

      // Verify rotation happened with the matching pod
      expect(utils.reloadPods).toHaveBeenCalledWith(
        "default",
        [matchingPod],
        "Secret multi-selector-secret change",
        expect.anything(),
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

      // Mock K8s responses
      mockGet.mockResolvedValue(mockPods);

      // First call should cache the checksum without rotating
      await handleSecretUpdate(secret1 as kind.Secret);
      expect(utils.reloadPods).not.toHaveBeenCalled();
      vi.clearAllMocks(); // Clear mock call history

      // Second call with changed data should reload only the pods using the secret
      await handleSecretUpdate(secret2 as kind.Secret);

      // Verify reloadPods was called with the correct parameters
      expect(utils.reloadPods).toHaveBeenCalledTimes(1);

      // Check that the namespace and reason are correct
      const reloadPodCalls = (utils.reloadPods as ReturnType<typeof vi.fn>).mock.calls[0];
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
});
