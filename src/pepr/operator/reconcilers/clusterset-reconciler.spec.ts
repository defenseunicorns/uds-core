/**
 * Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { beforeEach, describe, expect, test, vi } from "vitest";

const patchStatus = vi.fn();
vi.mock("pepr", () => ({
  K8s: vi.fn(() => ({ PatchStatus: patchStatus })),
  Log: {
    child: () => ({ info: vi.fn(), debug: vi.fn(), error: vi.fn(), trace: vi.fn(), warn: vi.fn() }),
  },
}));

import { clusterSetReconciler } from "./clusterset-reconciler";
import { ClusterSet } from "../crd";

describe("ClusterSet reconciler", () => {
  beforeEach(() => vi.clearAllMocks());

  test("patches status to Ready with observedGeneration", async () => {
    const cs = {
      apiVersion: "uds.dev/v1alpha1",
      kind: "ClusterSet",
      metadata: { name: "mission-edge", generation: 3, uid: "abc" },
      spec: { provider: "submariner", clusters: [{ name: "hub" }, { name: "edge-1" }] },
    } as ClusterSet;

    await clusterSetReconciler(cs);

    expect(patchStatus).toHaveBeenCalledTimes(1);
    const arg = patchStatus.mock.calls[0][0];
    expect(arg.metadata.name).toBe("mission-edge");
    expect(arg.status.phase).toBe("Ready");
    expect(arg.status.observedGeneration).toBe(3);
  });
});
