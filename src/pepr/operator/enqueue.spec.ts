import { beforeEach, expect, jest, describe, test } from "@jest/globals";
import { Log } from "pepr";

import { UDSPackage } from "./crd";
import { Queue } from "./enqueue";
import { reconciler } from "./reconciler";

jest.mock("pepr", () => ({
  Log: {
    debug: jest.fn(),
  },
}));

jest.mock("./reconciler", () => ({
  reconciler: jest.fn(),
}));

describe("Queue", () => {
  let queue: Queue;
  let mockPackage: UDSPackage;

  beforeEach(() => {
    jest.resetAllMocks();

    queue = new Queue();
    mockPackage = {
      metadata: { name: "test-package", namespace: "test-namespace" },
    };
  });

  test("enqueue should add a package to the queue and return a promise", async () => {
    const promise = queue.enqueue(mockPackage);
    expect(promise).toBeInstanceOf(Promise);
    await promise; // Wait for the promise to resolve
    expect(Log.debug).toHaveBeenCalledWith(`Enqueueing test-namespace/test-package`);
    expect(reconciler).toHaveBeenCalledWith(mockPackage);
  });

  test("dequeue should process packages in FIFO order", async () => {
    const mockPackage2 = {
      metadata: { name: "test-package-2", namespace: "test-namespace-2" },
    };

    // Enqueue two packages
    const promise1 = queue.enqueue(mockPackage);
    const promise2 = queue.enqueue(mockPackage2);

    // Wait for both promises to resolve
    await promise1;
    await promise2;

    // Check that reconciler was called with both packages in the correct order
    expect(reconciler).toHaveBeenNthCalledWith(1, mockPackage);
    expect(reconciler).toHaveBeenNthCalledWith(2, mockPackage2);
  });

  test("dequeue should handle errors in package processing", async () => {
    const error = new Error("reconciliation failed");
    (reconciler as jest.Mock<() => Promise<void>>).mockRejectedValueOnce(error);

    try {
      await queue.enqueue(mockPackage);
    } catch (e) {
      expect(e).toBe(error);
    }

    // Ensure that the queue is ready to process the next package
    const mockPackage2 = {
      metadata: { name: "test-package-2", namespace: "test-namespace-2" },
    };
    await queue.enqueue(mockPackage2);
    expect(reconciler).toHaveBeenCalledWith(mockPackage2);
  });
});
