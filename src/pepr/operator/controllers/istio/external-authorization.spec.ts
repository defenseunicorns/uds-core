/**
 * Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { UDSPackage } from "../../crd";
import { Mode } from "../../crd/generated/package-v1alpha1";
import { purgeOrphans } from "../utils";
import { cleanupWaypointLabels, setupAmbientWaypoint } from "./ambient-waypoint";
import {
  buildExternalAuthorizationPolicy,
  cleanupExternalAuthorization,
  externalAuthorization,
} from "./external-authorization";

const mockApply = vi.hoisted(() => vi.fn().mockResolvedValue({}));

vi.mock("pepr", () => ({
  K8s: vi.fn(() => ({
    Apply: mockApply,
  })),
}));

vi.mock("../utils", () => ({
  getOwnerRef: vi.fn(() => [{ kind: "Package", name: "ollama" }]),
  purgeOrphans: vi.fn().mockResolvedValue(undefined),
  sanitizeResourceName: vi.fn((name: string) => name),
}));

vi.mock("./ambient-waypoint", () => ({
  cleanupWaypointLabels: vi.fn().mockResolvedValue(undefined),
  setupAmbientWaypoint: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./istio-resources", () => ({
  log: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

function createPackage(mode: Mode = Mode.Ambient): UDSPackage {
  return {
    metadata: {
      name: "ollama",
      namespace: "ollama",
      generation: 2,
    },
    spec: {
      network: {
        serviceMesh: {
          mode,
          externalAuthorization: {
            provider: "opa",
            selector: {
              "app.kubernetes.io/name": "ollama",
            },
          },
        },
      },
    },
  };
}

describe("buildExternalAuthorizationPolicy", () => {
  it("targets the package waypoint in ambient mode", () => {
    const policy = buildExternalAuthorizationPolicy(createPackage(), true, "ollama-waypoint");

    expect(policy.metadata?.name).toBe("ollama-opa");
    expect(policy.spec).toMatchObject({
      action: "CUSTOM",
      provider: { name: "opa" },
      rules: [{}],
      targetRef: {
        group: "gateway.networking.k8s.io",
        kind: "Gateway",
        name: "ollama-waypoint",
      },
    });
    expect(policy.spec?.selector).toBeUndefined();
  });

  it("targets the workload selector in sidecar mode", () => {
    const policy = buildExternalAuthorizationPolicy(
      createPackage(Mode.Sidecar),
      false,
      "ollama-waypoint",
    );

    expect(policy.spec?.selector).toEqual({
      matchLabels: { "app.kubernetes.io/name": "ollama" },
    });
    expect(policy.spec?.targetRef).toBeUndefined();
  });
});

describe("externalAuthorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reconciles an ambient waypoint and CUSTOM policy", async () => {
    const pkg = createPackage();

    await expect(externalAuthorization(pkg)).resolves.toBe(1);

    expect(setupAmbientWaypoint).toHaveBeenCalledWith(
      pkg,
      {
        id: "ollama",
        selector: { "app.kubernetes.io/name": "ollama" },
        type: "external-authorization",
      },
      { "uds/for": "external-authorization" },
      true,
    );
    expect(mockApply).toHaveBeenCalledOnce();
    expect(purgeOrphans).toHaveBeenCalledTimes(2);
  });

  it("uses the sidecar selector without creating a waypoint", async () => {
    const pkg = createPackage(Mode.Sidecar);

    await expect(externalAuthorization(pkg)).resolves.toBe(1);

    expect(setupAmbientWaypoint).not.toHaveBeenCalled();
    expect(cleanupWaypointLabels).toHaveBeenCalledWith("ollama", "ollama-waypoint", {
      throwOnError: true,
    });
    expect(mockApply).toHaveBeenCalledOnce();
  });

  it("purges previous resources when configuration is removed", async () => {
    const pkg = createPackage();
    delete pkg.spec?.network?.serviceMesh?.externalAuthorization;
    pkg.status = { externalAuthorizationProvider: "opa" };

    await expect(externalAuthorization(pkg)).resolves.toBe(0);

    expect(cleanupWaypointLabels).toHaveBeenCalledWith("ollama", "ollama-waypoint", {
      throwOnError: true,
    });
    expect(mockApply).not.toHaveBeenCalled();
    expect(purgeOrphans).toHaveBeenCalledTimes(2);
  });

  it("does nothing when external authorization was never configured", async () => {
    const pkg = createPackage();
    delete pkg.spec?.network?.serviceMesh?.externalAuthorization;

    await expect(externalAuthorization(pkg)).resolves.toBe(0);

    expect(cleanupWaypointLabels).not.toHaveBeenCalled();
    expect(mockApply).not.toHaveBeenCalled();
    expect(purgeOrphans).not.toHaveBeenCalled();
  });

  it("stops reconciliation when strict waypoint cleanup fails", async () => {
    const pkg = createPackage(Mode.Sidecar);
    vi.mocked(cleanupWaypointLabels).mockRejectedValueOnce(new Error("Patch failed"));

    await expect(externalAuthorization(pkg)).rejects.toThrow("Patch failed");

    expect(mockApply).not.toHaveBeenCalled();
    expect(purgeOrphans).not.toHaveBeenCalled();
  });
});

describe("cleanupExternalAuthorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses strict cleanup so finalizer retries can observe failures", async () => {
    await cleanupExternalAuthorization(createPackage());

    expect(cleanupWaypointLabels).toHaveBeenCalledWith("ollama", "ollama-waypoint", {
      throwOnError: true,
    });
  });
});
