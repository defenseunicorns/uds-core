/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { Logger } from "pino";
import { retryWithDelay } from "./utils";

describe("retryWithDelay", () => {
  let mockLogger: Logger;

  beforeEach(() => {
    mockLogger = {
      warn: jest.fn(),
      level: "info",
      fatal: jest.fn(),
      error: jest.fn(),
      info: jest.fn(),
      debug: jest.fn(),
      trace: jest.fn(),
    } as unknown as Logger;
  });

  beforeEach(() => {});

  it("should succeed on the first attempt", async () => {
    const mockFn = jest.fn<() => Promise<string>>().mockResolvedValue("Success");

    const result = await retryWithDelay(mockFn, mockLogger);

    expect(result).toBe("Success");
    expect(mockFn).toHaveBeenCalledTimes(1); // Called only once
    expect(mockLogger.warn).not.toHaveBeenCalled(); // No warnings logged
  });

  it("should retry on failure and eventually succeed", async () => {
    const mockFn = jest
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("Fail on 1st try")) // Fail first attempt
      .mockResolvedValue("Success"); // Succeed on retry

    const result = await retryWithDelay(mockFn, mockLogger, 3, 100);

    expect(result).toBe("Success");
    expect(mockFn).toHaveBeenCalledTimes(2); // Called twice (1 fail + 1 success)
    expect(mockLogger.warn).toHaveBeenCalledTimes(1); // Warned once for the retry
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining("Attempt 1 of mockConstructor failed, retrying in 100ms."),
      expect.objectContaining({ error: expect.any(String) }),
    );
  });

  it("should retry when function rejects without an error", async () => {
    const mockFn = jest
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(undefined) // Rejected with no error
      .mockResolvedValue("Success"); // Succeed on retry

    const result = await retryWithDelay(mockFn, mockLogger, 3, 100);

    expect(result).toBe("Success");
    expect(mockFn).toHaveBeenCalledTimes(2); // Called twice (1 fail + 1 success)
    expect(mockLogger.warn).toHaveBeenCalledTimes(1);
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining("Attempt 1 of mockConstructor failed, retrying in 100ms."),
      expect.objectContaining({ error: "Unknown Error" }),
    );
  });

  it("should throw the original error after max retries", async () => {
    const error = new Error("Persistent failure");
    const mockFn = jest.fn<() => Promise<string>>().mockRejectedValue(error); // Always fails

    await expect(retryWithDelay(mockFn, mockLogger, 3, 100)).rejects.toThrow("Persistent failure");

    expect(mockFn).toHaveBeenCalledTimes(3); // Retries up to the limit
    expect(mockLogger.warn).toHaveBeenCalledTimes(2); // Logged for each failure except the final one
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining("Attempt 1 of mockConstructor failed, retrying in 100ms."),
      expect.objectContaining({ error: error.message }),
    );
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining("Attempt 2 of mockConstructor failed, retrying in 100ms."),
      expect.objectContaining({ error: error.message }),
    );
  });
});
