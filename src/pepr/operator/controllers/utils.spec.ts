/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { kind } from "pepr";
import { Logger } from "pino";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { retryWithDelay, validateNamespace } from "./utils";

// Mock the K8s Get function
const mockGet = vi.fn().mockImplementation(resource => Promise.resolve(resource));

// Mock the pepr module
vi.mock("pepr", () => {
  return {
    K8s: vi.fn(() => ({
      Get: mockGet,
    })),
    kind: {
      Namespace: "Namespace",
    },
  };
});

describe("retryWithDelay", () => {
  let mockLogger: Logger;

  beforeEach(() => {
    mockLogger = {
      warn: vi.fn(),
      level: "info",
      fatal: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      debug: vi.fn(),
      trace: vi.fn(),
    } as unknown as Logger;
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

describe("test validateNamespace", () => {
  beforeEach(() => {
    process.env.PEPR_WATCH_MODE = "true";
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // Helper function to test validateNamespace with custom mocks
  const testValidateNamespaceWithMock = async (
    namespaceName: string,
    mockImplementation: (resource: string) => Promise<kind.Namespace>,
    missingAllowed?: boolean,
  ) => {
    mockGet.mockImplementation(mockImplementation);
    return await validateNamespace(namespaceName, missingAllowed);
  };

  it("should return namespace object when namespace is found", async () => {
    const mockNamespace = { metadata: { name: "test-ns" } } as kind.Namespace;

    const result = await testValidateNamespaceWithMock("test-ns", () =>
      Promise.resolve(mockNamespace),
    );

    expect(result).toEqual(mockNamespace);
    expect(mockGet).toHaveBeenCalledWith("test-ns");
  });

  it("should return null if namespace is missing with missingAllowed=true", async () => {
    const error = { status: 404, message: "Namespace not found" };

    const result = await testValidateNamespaceWithMock(
      "missing-ns",
      () => Promise.reject(error),
      true,
    );

    expect(result).toBeNull();
    expect(mockGet).toHaveBeenCalledWith("missing-ns");
  });

  it("should throw error if namespace is missing with missingAllowed=false", async () => {
    const error = { status: 404, message: "Namespace not found" };

    await expect(
      testValidateNamespaceWithMock("missing-ns", () => Promise.reject(error), false),
    ).rejects.toEqual(error);

    expect(mockGet).toHaveBeenCalledWith("missing-ns");
  });

  it("should throw error for non-404 errors even with missingAllowed=true", async () => {
    const error = { status: 401, message: "Unauthorized" };

    await expect(
      testValidateNamespaceWithMock("test-ns", () => Promise.reject(error), true),
    ).rejects.toEqual(error);

    expect(mockGet).toHaveBeenCalledWith("test-ns");
  });
});
