/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { K8s, kind } from "pepr";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { computeSecretChecksum, handleSecretUpdate, handleSecretDelete } from "./auto-reload";
import * as utils from "../utils";

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
  evictPods: vi.fn(),
}));

// Import the secretChecksumCache directly
import { secretChecksumCache } from "./auto-reload";

describe("auto-reload", () => {
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
      expect(utils.evictPods).not.toHaveBeenCalled();

      // Missing name
      await handleSecretUpdate({ metadata: {} } as kind.Secret);
      expect(utils.evictPods).not.toHaveBeenCalled();

      // Missing namespace
      await handleSecretUpdate({ metadata: { name: "test-secret" } } as kind.Secret);
      expect(utils.evictPods).not.toHaveBeenCalled();

      // Missing data
      await handleSecretUpdate({
        metadata: { name: "test-secret", namespace: "default" },
      } as kind.Secret);
      expect(utils.evictPods).not.toHaveBeenCalled();
    });

    it("should not evict pods if the checksum has not changed", async () => {
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
      expect(utils.evictPods).not.toHaveBeenCalled();

      // Second call with the same data should not evict pods
      await handleSecretUpdate(secret as kind.Secret);
      expect(utils.evictPods).not.toHaveBeenCalled();
    });

    it("should evict pods when data changes and pods are found with explicit selector", async () => {
      // Mock pods
      const mockPods = {
        items: [
          { metadata: { name: "pod1", namespace: "default" } },
          { metadata: { name: "pod2", namespace: "default" } },
        ],
      };

      // First secret with initial data
      const secret1 = {
        metadata: {
          name: "test-secret",
          namespace: "default",
          labels: {
            "uds.dev/reload": "true",
            "uds.dev/reload-selector": JSON.stringify({ app: "test-app" }),
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

      // Mock K8s responses
      mockGet.mockResolvedValue(mockPods);

      // First call should cache the checksum without evicting
      await handleSecretUpdate(secret1 as kind.Secret);
      expect(utils.evictPods).not.toHaveBeenCalled();
      vi.clearAllMocks(); // Clear mock call history

      // Second call with changed data should evict pods
      await handleSecretUpdate(secret2 as kind.Secret);
      expect(utils.evictPods).toHaveBeenCalledWith(
        "default",
        expect.any(Array),
        "Secret test-secret change",
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
            "uds.dev/reload": "true",
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

      // First call should cache the checksum without evicting
      await handleSecretUpdate(secret1 as kind.Secret);
      expect(utils.evictPods).not.toHaveBeenCalled();
      vi.clearAllMocks(); // Clear mock call history

      // Second call with changed data should evict only the pods using the secret
      await handleSecretUpdate(secret2 as kind.Secret);

      // Verify evictPods was called with the correct parameters
      expect(utils.evictPods).toHaveBeenCalledTimes(1);

      // Check that the namespace and reason are correct
      const evictPodCalls = (utils.evictPods as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(evictPodCalls[0]).toBe("default"); // namespace
      expect(evictPodCalls[2]).toBe("Secret test-secret change"); // reason

      // Verify pods 1 and 2 were included and pod3 is NOT included
      const evictedPods = evictPodCalls[1] as kind.Pod[];
      expect(evictedPods.length).toBe(2);
      expect(evictedPods.some(pod => pod.metadata?.name === "pod1")).toBe(true);
      expect(evictedPods.some(pod => pod.metadata?.name === "pod2")).toBe(true);
      expect(evictedPods.some(pod => pod.metadata?.name === "pod3")).toBe(false);
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
      // which should not trigger eviction because cache was cleared
      await handleSecretUpdate(secret as kind.Secret);
      expect(utils.evictPods).not.toHaveBeenCalled();
    });
  });
});
