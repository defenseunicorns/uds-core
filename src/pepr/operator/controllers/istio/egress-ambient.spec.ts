/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { afterEach, beforeEach, describe, expect, it, Mock, MockedFunction, vi } from "vitest";
import { Direction, RemoteProtocol } from "../../crd";
import { purgeOrphans } from "../utils";
import { defaultEgressMocks, updateEgressMocks } from "./defaultTestMocks";

import {
  applyAmbientEgressResources,
  createAmbientWorkloadEgressResources,
  purgeAmbientEgressResources,
} from "./egress-ambient";
import { waitForWaypointPodHealthy } from "./ambient-waypoint";

// Mock purge orphans
const mockPurgeOrphans: MockedFunction<() => Promise<void>> = vi.fn();
vi.mock("../utils", async () => {
  const originalModule = (await vi.importActual("../utils")) as object;
  return {
    ...originalModule,
    purgeOrphans: vi.fn(async <T>(fn: () => Promise<T>) => fn()),
  };
});

// Mock ambient-waypoint functions
vi.mock("./ambient-waypoint", async () => {
  const originalModule = (await vi.importActual("./ambient-waypoint")) as object;
  return {
    ...originalModule,
    waitForWaypointPodHealthy: vi.fn().mockResolvedValue(undefined),
  };
});

// Mock pepr functions
vi.mock("pepr", () => ({
  K8s: vi.fn(),
  Log: {
    child: vi.fn(() => ({
      info: vi.fn(),
      debug: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      level: "info",
    })),
  },
  kind: {
    Gateway: "Gateway",
    VirtualService: "VirtualService",
    ServiceEntry: "ServiceEntry",
    Namespace: "Namespace",
    Service: "Service",
    ServiceAccount: "ServiceAccount",
    Waypoint: "Waypoint",
  },
}));

describe("test applyAmbientEgressResources", () => {
  beforeEach(async () => {
    process.env.PEPR_WATCH_MODE = "true";
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("should apply ambient egress resources", async () => {
    updateEgressMocks(defaultEgressMocks);

    await applyAmbientEgressResources(new Set(["test-package-1", "test-package-2"]), 1);

    expect(defaultEgressMocks.applyWaypointMock).toHaveBeenCalledTimes(1);
  });

  it("should handle empty package set", async () => {
    updateEgressMocks(defaultEgressMocks);

    await expect(applyAmbientEgressResources(new Set(), 1)).resolves.not.toThrow();

    // No resources should be applied for empty set
    expect(defaultEgressMocks.applyWaypointMock).not.toHaveBeenCalled();
  });

  it("should propagate waitForWaypointPodHealthy failure", async () => {
    updateEgressMocks(defaultEgressMocks);

    // Mock waitForWaypointPodHealthy to reject
    const mockWaitForWaypointPodHealthy = vi.mocked(waitForWaypointPodHealthy);
    mockWaitForWaypointPodHealthy.mockRejectedValueOnce(new Error("Pod health check failed"));

    // Should throw the error from waitForWaypointPodHealthy
    await expect(applyAmbientEgressResources(new Set(["test-package-1"]), 1)).rejects.toThrow(
      "Pod health check failed",
    );

    // Should still have applied the waypoint before the failure
    expect(defaultEgressMocks.applyWaypointMock).toHaveBeenCalledTimes(1);
    expect(mockWaitForWaypointPodHealthy).toHaveBeenCalledTimes(1);
  });
});

describe("test purgeAmbientEgressResources", () => {
  beforeEach(() => {
    process.env.PEPR_WATCH_MODE = "true";
    vi.useFakeTimers();
    vi.clearAllMocks();

    (purgeOrphans as Mock).mockImplementation(mockPurgeOrphans);
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("should purge sidecar egress resources", async () => {
    updateEgressMocks(defaultEgressMocks);

    await purgeAmbientEgressResources("1");

    expect(mockPurgeOrphans).toHaveBeenCalledTimes(1);
  });

  it("should handle purge error", async () => {
    const errorMessage = "Purge error";

    mockPurgeOrphans.mockRejectedValueOnce(new Error(errorMessage));

    await expect(purgeAmbientEgressResources("1")).rejects.toThrow(
      "Failed to purge orphaned ambient egress resources",
    );
  });
});

describe("test createAmbientWorkloadEgressResources", () => {
  beforeEach(() => {
    process.env.PEPR_WATCH_MODE = "true";
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("should create ambient egress resources", async () => {
    updateEgressMocks(defaultEgressMocks);

    await createAmbientWorkloadEgressResources(
      {
        "example.com": {
          portProtocol: [{ port: 443, protocol: RemoteProtocol.TLS }],
        },
      },
      [
        {
          direction: Direction.Egress,
          remoteHost: "example.com",
          remoteProtocol: RemoteProtocol.TLS,
          port: 443,
          serviceAccount: "test-sa",
        },
      ],
      "test-package",
      "test-ns",
      "1",
      [],
    );

    expect(defaultEgressMocks.applySeMock).toHaveBeenCalledTimes(1);
    expect(defaultEgressMocks.applyApMock).toHaveBeenCalledTimes(1);
  });

  it("should create ambient egress resources for multiple hosts", async () => {
    updateEgressMocks(defaultEgressMocks);

    await createAmbientWorkloadEgressResources(
      {
        "example.com": {
          portProtocol: [{ port: 443, protocol: RemoteProtocol.TLS }],
        },
        "httpbin.org": {
          portProtocol: [{ port: 443, protocol: RemoteProtocol.TLS }],
        },
      },
      [
        {
          direction: Direction.Egress,
          remoteHost: "example.com",
          remoteProtocol: RemoteProtocol.TLS,
          port: 443,
          serviceAccount: "test-sa",
        },
        {
          direction: Direction.Egress,
          remoteHost: "httpbin.org",
          remoteProtocol: RemoteProtocol.TLS,
          port: 443,
          serviceAccount: "test-sa",
        },
      ],
      "test-package",
      "test-ns",
      "1",
      [],
    );

    expect(defaultEgressMocks.applySeMock).toHaveBeenCalledTimes(2);
    expect(defaultEgressMocks.applyApMock).toHaveBeenCalledTimes(2);
  });

  it("should create ambient egress resources, no service account", async () => {
    updateEgressMocks(defaultEgressMocks);

    await createAmbientWorkloadEgressResources(
      {
        "example.com": {
          portProtocol: [{ port: 443, protocol: RemoteProtocol.TLS }],
        },
      },
      [
        {
          direction: Direction.Egress,
          remoteHost: "example.com",
          remoteProtocol: RemoteProtocol.TLS,
          port: 443,
        },
      ],
      "test-package",
      "test-ns",
      "1",
      [],
    );

    expect(defaultEgressMocks.applySeMock).toHaveBeenCalledTimes(1);
    expect(defaultEgressMocks.applyApMock).toHaveBeenCalledTimes(1); // still called with default service account
  });
});
