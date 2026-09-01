/**
 * Copyright 2025-2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { kind } from "pepr";
import { afterEach, beforeEach, describe, expect, it, Mock, MockedFunction, vi } from "vitest";
import { Direction, RemoteGenerated, RemoteProtocol, UDSPackage } from "../../crd";
import { defaultEgressMocks, pkgMock, updateEgressMocks } from "./defaultTestMocks";
import {
  buildEgressMaps,
  createAmbientPackageEntry,
  createHostResourceMap,
  egressRequestedFromNetwork,
  getHostPortsProtocol,
  inMemoryAmbientPackageMap,
  inMemoryPackageMap,
  performEgressReconciliation,
  reconcileSharedEgressResources,
  removeMapResources,
  updateInMemoryAmbientPackageMap,
  updateInMemoryPackageMap,
  validateProtocolConflicts,
} from "./egress";
import { HostResourceMap, PackageAction, PackageHostMap } from "./types";

// Mock istio-resources
vi.mock("./istio-resources", async () => {
  const originalModule = (await vi.importActual("./istio-resources")) as object;
  return {
    ...originalModule,
    log: {
      debug: vi.fn(),
      error: vi.fn(),
    },
  };
});

import { log } from "./istio-resources";

// Mock purge orphans
import { purgeOrphans } from "../utils";
const mockPurgeOrphans: MockedFunction<() => Promise<void>> = vi.fn();
vi.mock("../utils", async () => {
  const originalModule = (await vi.importActual("../utils")) as object;
  return {
    ...originalModule,
    purgeOrphans: vi.fn(async <T>(fn: () => Promise<T>) => fn()),
  };
});

// Mock apply functions for sidecar
import { applySidecarEgressResources } from "./egress-sidecar";
const mockApplySidecarEgressResources: MockedFunction<() => Promise<void>> = vi.fn();
vi.mock("./egress-sidecar", async () => {
  const originalModule = await vi.importActual("./egress-sidecar");
  return {
    ...originalModule,
    applySidecarEgressResources: vi.fn(),
  };
});

// Mock apply functions for ambient
import { Mode, Phase } from "../../crd/generated/package-v1alpha1";
import { applyAmbientEgressResources, purgeAmbientEgressResources } from "./egress-ambient";
const mockApplyAmbientEgressResources: MockedFunction<() => Promise<void>> = vi.fn();
vi.mock("./egress-ambient", async () => {
  const originalModule = await vi.importActual("./egress-ambient");
  return {
    ...originalModule,
    applyAmbientEgressResources: vi.fn(),
    purgeAmbientEgressResources: vi.fn(),
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

describe("test reconcileSharedEgressResources", () => {
  const hostResourceMapMock: HostResourceMap = {
    "example.com": {
      portProtocol: [{ port: 443, protocol: RemoteProtocol.TLS }],
    },
  };

  const pkgWithAllow: UDSPackage = {
    ...pkgMock,
    metadata: {
      ...pkgMock.metadata,
      name: "test-package",
      namespace: "test-namespace",
    },
    spec: {
      ...pkgMock.spec,
      network: {
        ...pkgMock.spec?.network,
        allow: [
          {
            direction: Direction.Egress,
            remoteHost: "example.com",
            remoteProtocol: RemoteProtocol.TLS,
            port: 443,
          },
        ],
      },
    },
  };

  beforeEach(async () => {
    process.env.PEPR_WATCH_MODE = "true";
    vi.useFakeTimers();
    vi.clearAllMocks();
    // Reset the map before each test
    for (const key in inMemoryPackageMap) {
      delete inMemoryPackageMap[key];
    }
    for (const key in inMemoryAmbientPackageMap) {
      delete inMemoryAmbientPackageMap[key];
    }

    (purgeOrphans as Mock).mockImplementation(mockPurgeOrphans);
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("should populate in-memory vars on action AddOrUpdate, sidecar", async () => {
    updateEgressMocks({
      ...defaultEgressMocks,
      getPkgListMock: vi.fn().mockResolvedValue({
        items: [
          {
            ...pkgWithAllow,
            spec: {
              ...pkgWithAllow.spec,
              network: { ...pkgWithAllow.spec?.network, serviceMesh: { mode: Mode.Sidecar } },
            },
          },
        ],
      }),
    });

    await reconcileSharedEgressResources(
      pkgWithAllow,
      hostResourceMapMock,
      PackageAction.AddOrUpdate,
      Mode.Sidecar,
    );

    // Validate inMemoryPackageMap
    expect(inMemoryPackageMap).toEqual({ "test-package-test-namespace": hostResourceMapMock });

    // Validate inMemoryAmbientPackageMap
    expect(inMemoryAmbientPackageMap).toEqual({});
  });

  it("should populate in-memory vars on action AddOrUpdate, ambient", async () => {
    updateEgressMocks(defaultEgressMocks);

    await reconcileSharedEgressResources(
      pkgWithAllow,
      hostResourceMapMock,
      PackageAction.AddOrUpdate,
      Mode.Ambient,
    );

    // Validate inMemoryPackageMap
    expect(inMemoryPackageMap).toEqual({});

    // Validate inMemoryAmbientPackageMap
    expect(inMemoryAmbientPackageMap).toEqual({
      "test-package-test-namespace": {
        name: "test-package",
        namespace: "test-namespace",
        rules: [
          {
            kind: "host",
            host: "example.com",
            ports: [443],
            protocol: RemoteProtocol.TLS,
          },
        ],
      },
    });
  });

  it("should update in-memory vars on action AddOrUpdate, sidecar to ambient", async () => {
    updateEgressMocks(defaultEgressMocks);

    await reconcileSharedEgressResources(
      pkgWithAllow,
      hostResourceMapMock,
      PackageAction.AddOrUpdate,
      Mode.Sidecar,
    );

    // Validate inMemoryPackageMap is populated
    expect(inMemoryPackageMap).toEqual({ "test-package-test-namespace": hostResourceMapMock });

    // Validate inMemoryAmbientPackageMap is still empty
    expect(inMemoryAmbientPackageMap).toEqual({});

    // Update to ambient
    await reconcileSharedEgressResources(
      pkgWithAllow,
      hostResourceMapMock,
      PackageAction.AddOrUpdate,
      Mode.Ambient,
    );

    // Validate inMemoryPackageMap now empty
    expect(inMemoryPackageMap).toEqual({});

    // Validate inMemoryAmbientPackageMap is populated
    expect(inMemoryAmbientPackageMap).toEqual({
      "test-package-test-namespace": {
        name: "test-package",
        namespace: "test-namespace",
        rules: [
          {
            kind: "host",
            host: "example.com",
            ports: [443],
            protocol: "TLS",
          },
        ],
      },
    });
  });

  it("should update in-memory vars on action AddOrUpdate, ambient to sidecar", async () => {
    updateEgressMocks(defaultEgressMocks);

    await reconcileSharedEgressResources(
      pkgWithAllow,
      hostResourceMapMock,
      PackageAction.AddOrUpdate,
      Mode.Ambient,
    );

    // Validate inMemoryPackageMap is empty
    expect(inMemoryPackageMap).toEqual({});

    // Validate inMemoryAmbientPackageMap is populated
    expect(inMemoryAmbientPackageMap).toEqual({
      "test-package-test-namespace": {
        name: "test-package",
        namespace: "test-namespace",
        rules: [
          {
            kind: "host",
            host: "example.com",
            ports: [443],
            protocol: RemoteProtocol.TLS,
          },
        ],
      },
    });

    await reconcileSharedEgressResources(
      pkgWithAllow,
      hostResourceMapMock,
      PackageAction.AddOrUpdate,
      Mode.Sidecar,
    );

    // Validate inMemoryPackageMap is populated
    expect(inMemoryPackageMap).toEqual({ "test-package-test-namespace": hostResourceMapMock });

    // Validate inMemoryAmbientPackageMap is now empty
    expect(inMemoryAmbientPackageMap).toEqual({});
  });

  it("should update in-memory vars on action Remove, sidecar", async () => {
    updateEgressMocks(defaultEgressMocks);

    // Populate inMemoryPackageMap first
    await reconcileSharedEgressResources(
      pkgWithAllow,
      hostResourceMapMock,
      PackageAction.AddOrUpdate,
      Mode.Sidecar,
    );

    // Validate inMemoryPackageMap is populated
    expect(inMemoryPackageMap).toEqual({ "test-package-test-namespace": hostResourceMapMock });

    // Validate inMemoryAmbientPackageMap is empty
    expect(inMemoryAmbientPackageMap).toEqual({});

    // Remove packageIdMock
    await reconcileSharedEgressResources(
      pkgWithAllow,
      hostResourceMapMock,
      PackageAction.Remove,
      Mode.Sidecar,
    );

    // Validate inMemoryPackageMap is now empty
    expect(inMemoryPackageMap).toEqual({});

    // Validate inMemoryAmbientPackageMap is still empty
    expect(inMemoryAmbientPackageMap).toEqual({});
  });

  it("should update in-memory vars on action Remove, ambient", async () => {
    updateEgressMocks(defaultEgressMocks);

    // Populate inMemoryAmbientPackages first
    await reconcileSharedEgressResources(
      pkgWithAllow,
      hostResourceMapMock,
      PackageAction.AddOrUpdate,
      Mode.Ambient,
    );

    // Validate inMemoryPackageMap is still empty
    expect(inMemoryPackageMap).toEqual({});

    // Validate inMemoryAmbientPackageMap is populated
    expect(inMemoryAmbientPackageMap).toEqual({
      "test-package-test-namespace": {
        name: "test-package",
        namespace: "test-namespace",
        rules: [
          {
            kind: "host",
            host: "example.com",
            ports: [443],
            protocol: RemoteProtocol.TLS,
          },
        ],
      },
    });

    // Remove packageIdMock
    await reconcileSharedEgressResources(
      pkgWithAllow,
      hostResourceMapMock,
      PackageAction.Remove,
      Mode.Ambient,
    );

    // Validate inMemoryPackageMap is still empty
    expect(inMemoryPackageMap).toEqual({});

    // Validate inMemoryAmbientPackages is now empty
    expect(inMemoryAmbientPackageMap).toEqual({});
  });
});

describe("test shared egress reconciliation serialization", () => {
  beforeEach(() => {
    process.env.PEPR_WATCH_MODE = "true";
    vi.clearAllMocks();
    for (const key in inMemoryPackageMap) {
      delete inMemoryPackageMap[key];
    }
    for (const key in inMemoryAmbientPackageMap) {
      delete inMemoryAmbientPackageMap[key];
    }

    (purgeOrphans as Mock).mockImplementation(mockPurgeOrphans);
  });

  it("serializes map updates through apply and purge", async () => {
    updateEgressMocks(defaultEgressMocks);
    const snapshots: string[][] = [];
    const order: string[] = [];
    let releaseFirstApply!: () => void;
    let firstApplyStarted!: () => void;
    const firstApply = new Promise<void>(resolve => {
      releaseFirstApply = resolve;
    });
    const started = new Promise<void>(resolve => {
      firstApplyStarted = resolve;
    });

    vi.mocked(applySidecarEgressResources).mockImplementation(async packageMap => {
      const packages = Object.keys(packageMap).sort();
      snapshots.push(packages);
      order.push(`apply:${packages.join(",")}`);
      if (snapshots.length === 1) {
        firstApplyStarted();
        await firstApply;
      }
    });
    (purgeOrphans as Mock).mockImplementation(async () => {
      order.push("sidecar-purge");
    });
    vi.mocked(purgeAmbientEgressResources).mockImplementation(async () => {
      order.push("ambient-purge");
    });

    const secondPackage = {
      ...pkgMock,
      metadata: { ...pkgMock.metadata, name: "second-package" },
    };
    const first = reconcileSharedEgressResources(
      pkgMock,
      { "first.example.com": { portProtocol: [{ port: 443, protocol: RemoteProtocol.TLS }] } },
      PackageAction.AddOrUpdate,
      Mode.Sidecar,
    );
    await started;
    const second = reconcileSharedEgressResources(
      secondPackage,
      { "second.example.com": { portProtocol: [{ port: 443, protocol: RemoteProtocol.TLS }] } },
      PackageAction.AddOrUpdate,
      Mode.Sidecar,
    );

    await Promise.resolve();
    expect(inMemoryPackageMap).toEqual({
      "test-package-test-namespace": {
        "first.example.com": { portProtocol: [{ port: 443, protocol: RemoteProtocol.TLS }] },
      },
    });

    releaseFirstApply();
    await expect(Promise.all([first, second])).resolves.toEqual([undefined, undefined]);

    expect(snapshots).toEqual([
      ["test-package-test-namespace"],
      ["second-package-test-namespace", "test-package-test-namespace"],
    ]);
    expect(order).toEqual([
      "apply:test-package-test-namespace",
      "sidecar-purge",
      "sidecar-purge",
      "sidecar-purge",
      "ambient-purge",
      "apply:second-package-test-namespace,test-package-test-namespace",
      "sidecar-purge",
      "sidecar-purge",
      "sidecar-purge",
      "ambient-purge",
    ]);
  });

  it("releases the mutex after a failed reconciliation", async () => {
    updateEgressMocks(defaultEgressMocks);
    vi.mocked(applySidecarEgressResources)
      .mockRejectedValueOnce(new Error("apply failed"))
      .mockResolvedValueOnce();

    const first = reconcileSharedEgressResources(
      pkgMock,
      { "first.example.com": { portProtocol: [{ port: 443, protocol: RemoteProtocol.TLS }] } },
      PackageAction.AddOrUpdate,
      Mode.Sidecar,
    );
    const second = reconcileSharedEgressResources(
      { ...pkgMock, metadata: { ...pkgMock.metadata, name: "second-package" } },
      { "second.example.com": { portProtocol: [{ port: 443, protocol: RemoteProtocol.TLS }] } },
      PackageAction.AddOrUpdate,
      Mode.Sidecar,
    );

    await expect(first).rejects.toThrow("Egress reconciliation failed");
    await expect(second).resolves.toBeUndefined();
    expect(applySidecarEgressResources).toHaveBeenCalledTimes(2);
  });

  it("keeps sidecar state when an ambient transition fails validation", async () => {
    updateEgressMocks(defaultEgressMocks);
    const sidecarPackage = {
      ...pkgMock,
      metadata: { ...pkgMock.metadata, name: "transition-package" },
      spec: {
        network: {
          allow: [
            {
              direction: Direction.Egress,
              remoteHost: "example.com",
              remoteProtocol: RemoteProtocol.TLS,
              port: 443,
            },
          ],
        },
      },
    };
    const conflictingAmbientPackage = {
      ...pkgMock,
      metadata: { ...pkgMock.metadata, name: "ambient-package" },
      spec: {
        network: {
          allow: [
            {
              direction: Direction.Egress,
              remoteHost: "example.com",
              remoteProtocol: RemoteProtocol.HTTP,
              port: 443,
            },
          ],
        },
      },
    };

    await reconcileSharedEgressResources(
      sidecarPackage,
      { "example.com": { portProtocol: [{ port: 443, protocol: RemoteProtocol.TLS }] } },
      PackageAction.AddOrUpdate,
      Mode.Sidecar,
    );
    await reconcileSharedEgressResources(
      conflictingAmbientPackage,
      undefined,
      PackageAction.AddOrUpdate,
      Mode.Ambient,
    );

    await expect(
      reconcileSharedEgressResources(
        sidecarPackage,
        { "example.com": { portProtocol: [{ port: 443, protocol: RemoteProtocol.TLS }] } },
        PackageAction.AddOrUpdate,
        Mode.Ambient,
      ),
    ).rejects.toThrow("Protocol conflict detected");

    expect(inMemoryPackageMap).toEqual({
      "transition-package-test-namespace": {
        "example.com": { portProtocol: [{ port: 443, protocol: RemoteProtocol.TLS }] },
      },
    });
    expect(inMemoryAmbientPackageMap).toHaveProperty("ambient-package-test-namespace");
    expect(inMemoryAmbientPackageMap).not.toHaveProperty("transition-package-test-namespace");
  });
});

describe("test performEgressReconciliation", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Reset the in-memory vars before each test
    for (const key in inMemoryPackageMap) {
      delete inMemoryPackageMap[key];
    }
    for (const key in inMemoryAmbientPackageMap) {
      delete inMemoryAmbientPackageMap[key];
    }

    (purgeOrphans as Mock).mockImplementation(mockPurgeOrphans);
    (applySidecarEgressResources as Mock).mockImplementation(mockApplySidecarEgressResources);
    (applyAmbientEgressResources as Mock).mockImplementation(mockApplyAmbientEgressResources);
    (purgeAmbientEgressResources as Mock).mockImplementation(async () => {
      const log = {
        info: vi.fn(),
        debug: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      } as unknown as Parameters<typeof purgeOrphans>[4];

      await purgeOrphans(
        "1",
        "istio-egress-ambient",
        "shared-ambient-egress-resource",
        {} as never,
        log,
      );
      await purgeOrphans(
        "1",
        "istio-egress-ambient",
        "shared-ambient-egress-resource",
        {} as never,
        log,
      );
      await purgeOrphans(
        "1",
        "istio-egress-ambient",
        "shared-ambient-egress-resource",
        {} as never,
        log,
      );
    });
  });

  it("should successfully reconcile egress resources", async () => {
    updateEgressMocks(defaultEgressMocks);

    await performEgressReconciliation();

    // Check that apply functions are called
    expect(applySidecarEgressResources).toHaveBeenCalled();
    expect(applyAmbientEgressResources).toHaveBeenCalled();

    // Purges sidecar (Gateway, VirtualService, ServiceEntry) and ambient (Gateway, ServiceEntry, AuthorizationPolicy)
    expect(purgeOrphans).toHaveBeenCalledTimes(6);
  });

  it("should skip sidecar reconciliation when namespace is not found", async () => {
    updateEgressMocks({
      ...defaultEgressMocks,
      getNsMock: vi
        .fn<() => Promise<kind.Namespace>>()
        .mockRejectedValueOnce({
          status: 404,
          message: "Namespace not found",
        })
        .mockResolvedValueOnce({}),
    });

    await performEgressReconciliation();

    // Check that apply functions are called or not called
    expect(applySidecarEgressResources).not.toHaveBeenCalled();
    expect(applyAmbientEgressResources).toHaveBeenCalled();

    // Ambient-only purge (Gateway, ServiceEntry, AuthorizationPolicy)
    expect(purgeOrphans).toHaveBeenCalledTimes(3);
  });

  it("should err on reconciliation when get namespace returns error", async () => {
    updateEgressMocks({
      ...defaultEgressMocks,
      getNsMock: vi
        .fn<() => Promise<kind.Namespace>>()
        .mockRejectedValueOnce({
          status: 401,
          message: "Authorization error",
        })
        .mockResolvedValueOnce({}),
    });

    await expect(performEgressReconciliation()).rejects.toThrow();

    // Check that apply functions are called or not called
    expect(applySidecarEgressResources).not.toHaveBeenCalled();
    expect(applyAmbientEgressResources).toHaveBeenCalled();

    // Ambient-only purge (Gateway, ServiceEntry, AuthorizationPolicy)
    expect(purgeOrphans).toHaveBeenCalledTimes(3);
  });

  it("should skip ambient reconciliation when namespace is not found", async () => {
    updateEgressMocks({
      ...defaultEgressMocks,
      getNsMock: vi
        .fn<() => Promise<kind.Namespace>>()
        .mockResolvedValueOnce({})
        .mockRejectedValueOnce({
          status: 404,
          message: "Namespace not found",
        }),
    });

    await performEgressReconciliation();

    // Check that apply functions are called or not called
    expect(applySidecarEgressResources).toHaveBeenCalled();
    expect(applyAmbientEgressResources).not.toHaveBeenCalled();

    // Check that purge was called 3 times (sidecar only)
    expect(purgeOrphans).toHaveBeenCalledTimes(3);
  });

  it("should err on ambient reconciliation when get namespace returns error", async () => {
    updateEgressMocks({
      ...defaultEgressMocks,
      getNsMock: vi
        .fn<() => Promise<kind.Namespace>>()
        .mockResolvedValueOnce({})
        .mockRejectedValueOnce({
          status: 401,
          message: "Authorization error",
        }),
    });

    await expect(performEgressReconciliation()).rejects.toThrow();
  });
});

describe("test updateInMemoryPackageMap", () => {
  const hostResourceMapMockTls: HostResourceMap = {
    "example.com": {
      portProtocol: [{ port: 443, protocol: RemoteProtocol.TLS }],
    },
  };
  const hostResourceMapMockHttp: HostResourceMap = {
    "example.com": {
      portProtocol: [{ port: 80, protocol: RemoteProtocol.HTTP }],
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset the map before each test
    for (const key in inMemoryPackageMap) {
      delete inMemoryPackageMap[key];
    }
  });

  it("should handle normal update scenario", async () => {
    // This test verifies the normal update mechanism works correctly
    await expect(
      updateInMemoryPackageMap(hostResourceMapMockTls, "package1", PackageAction.AddOrUpdate),
    ).resolves.not.toThrow();

    expect(inMemoryPackageMap["package1"]).toEqual(hostResourceMapMockTls);
  });

  it("should resolve concurrent updates correctly", async () => {
    // Mock packages
    const mockUpdates = [
      {
        pkgId: "test-package-test-namespace1",
        hostResourceMap: hostResourceMapMockTls,
        action: PackageAction.AddOrUpdate,
      },
      {
        pkgId: "test-package-test-namespace2",
        hostResourceMap: hostResourceMapMockHttp,
        action: PackageAction.AddOrUpdate,
      },
      {
        pkgId: "test-package-test-namespace3",
        hostResourceMap: hostResourceMapMockTls,
        action: PackageAction.AddOrUpdate,
      },
      {
        pkgId: "test-package-test-namespace4",
        hostResourceMap: hostResourceMapMockHttp,
        action: PackageAction.AddOrUpdate,
      },
    ];

    // Create an array of promises for each update
    const promises = mockUpdates.map(
      ({ pkgId, hostResourceMap, action }) =>
        new Promise<void>((resolve, reject) => {
          setTimeout(async () => {
            try {
              await updateInMemoryPackageMap(hostResourceMap, pkgId, action);
              resolve();
            } catch (error) {
              reject(error);
            }
          }, 0);
        }),
    );

    // Wait for all updates to complete
    await Promise.all(promises);

    // Validate inMemoryPackageMap
    expect(inMemoryPackageMap).toEqual({
      "test-package-test-namespace1": hostResourceMapMockTls,
      "test-package-test-namespace2": hostResourceMapMockHttp,
      "test-package-test-namespace3": hostResourceMapMockTls,
      "test-package-test-namespace4": hostResourceMapMockHttp,
    });
    expect(log.error).not.toHaveBeenCalled();
  });

  it("should reject conflicting protocols during update", async () => {
    // First, add a package with TLS on port 443
    await updateInMemoryPackageMap(hostResourceMapMockTls, "package1", PackageAction.AddOrUpdate);

    // Now try to add a conflicting package with HTTP on the same port
    const hostResourceMapHttp: HostResourceMap = {
      "example.com": {
        portProtocol: [{ port: 443, protocol: RemoteProtocol.HTTP }],
      },
    };

    await expect(
      updateInMemoryPackageMap(hostResourceMapHttp, "package2", PackageAction.AddOrUpdate),
    ).rejects.toThrow(
      'Protocol conflict detected for example.com:443. Package "package2" wants to use HTTP but package "package1" is already using TLS for the same host and port combination.',
    );

    // Verify the first package is still in the map and the conflicting one was not added
    expect(inMemoryPackageMap).toEqual({
      package1: hostResourceMapMockTls,
    });
  });

  it("should allow updating same package with different protocol", async () => {
    // First, add a package with TLS on port 443
    await updateInMemoryPackageMap(hostResourceMapMockTls, "package1", PackageAction.AddOrUpdate);

    // Now update the same package with HTTP on the same port (should be allowed)
    await expect(
      updateInMemoryPackageMap(hostResourceMapMockHttp, "package1", PackageAction.AddOrUpdate),
    ).resolves.not.toThrow();

    // Verify the package was updated
    expect(inMemoryPackageMap).toEqual({
      package1: hostResourceMapMockHttp,
    });
  });

  it("should handle undefined hostResourceMap correctly", async () => {
    await updateInMemoryPackageMap(undefined, "package1", PackageAction.AddOrUpdate);
    expect(inMemoryPackageMap).toEqual({});
  });

  it("should remove package correctly on action AddOrUpdate", async () => {
    // Add a package
    await updateInMemoryPackageMap(hostResourceMapMockTls, "package1", PackageAction.AddOrUpdate);
    expect(inMemoryPackageMap["package1"]).toEqual(hostResourceMapMockTls);

    // Then update with empty map
    await updateInMemoryPackageMap(undefined, "package1", PackageAction.AddOrUpdate);
    expect(inMemoryPackageMap).toEqual({});
  });

  it("should remove package correctly on action Remove", async () => {
    // Add a package
    await updateInMemoryPackageMap(hostResourceMapMockTls, "package1", PackageAction.AddOrUpdate);
    expect(inMemoryPackageMap["package1"]).toEqual(hostResourceMapMockTls);

    // Then remove it
    await updateInMemoryPackageMap(undefined, "package1", PackageAction.Remove);
    expect(inMemoryPackageMap).toEqual({});
  });
});

describe("test updateInMemoryAmbientPackageMap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset the map before each test
    for (const key in inMemoryAmbientPackageMap) {
      delete inMemoryAmbientPackageMap[key];
    }
  });

  it("should handle normal update scenario", async () => {
    const pkg: UDSPackage = {
      ...pkgMock,
      metadata: {
        ...pkgMock.metadata,
        name: "package1",
        namespace: "ns1",
      },
      spec: {
        ...pkgMock.spec,
        network: {
          ...pkgMock.spec?.network,
          allow: [
            {
              direction: Direction.Egress,
              remoteHost: "example.com",
              remoteProtocol: RemoteProtocol.TLS,
              port: 443,
            },
          ],
        },
      },
    };

    await expect(
      updateInMemoryAmbientPackageMap(pkg, "package1-ns1", PackageAction.AddOrUpdate),
    ).resolves.not.toThrow();

    expect(inMemoryAmbientPackageMap["package1-ns1"]).toEqual({
      name: "package1",
      namespace: "ns1",
      rules: [
        {
          kind: "host",
          host: "example.com",
          ports: [443],
          protocol: RemoteProtocol.TLS,
        },
      ],
    });
  });

  it("should resolve concurrent updates correctly", async () => {
    const pkgA: UDSPackage = {
      ...pkgMock,
      metadata: { ...pkgMock.metadata, name: "pkg1", namespace: "ns1" },
      spec: {
        ...pkgMock.spec,
        network: {
          ...pkgMock.spec?.network,
          allow: [
            {
              direction: Direction.Egress,
              remoteHost: "example.com",
              remoteProtocol: RemoteProtocol.TLS,
            },
          ],
        },
      },
    };
    const pkgB: UDSPackage = {
      ...pkgMock,
      metadata: { ...pkgMock.metadata, name: "pkg2", namespace: "ns2" },
      spec: {
        ...pkgMock.spec,
        network: {
          ...pkgMock.spec?.network,
          allow: [
            {
              direction: Direction.Egress,
              remoteHost: "httpbin.org",
              remoteProtocol: RemoteProtocol.TLS,
            },
          ],
        },
      },
    };
    const pkgC: UDSPackage = {
      ...pkgMock,
      metadata: { ...pkgMock.metadata, name: "pkg3", namespace: "ns3" },
      spec: {
        ...pkgMock.spec,
        network: {
          ...pkgMock.spec?.network,
          allow: [
            {
              direction: Direction.Egress,
              remoteHost: "example.com",
              remoteProtocol: RemoteProtocol.TLS,
              ports: [443, 8443],
            },
          ],
        },
      },
    };
    const pkgD: UDSPackage = {
      ...pkgMock,
      metadata: { ...pkgMock.metadata, name: "pkg4", namespace: "ns4" },
      spec: {
        ...pkgMock.spec,
        network: {
          ...pkgMock.spec?.network,
          allow: [
            {
              direction: Direction.Egress,
              remoteHost: "httpbin.org",
              remoteProtocol: RemoteProtocol.TLS,
              port: 443,
            },
          ],
        },
      },
    };

    const mockUpdates = [
      { pkg: pkgA, pkgId: "pkg1-ns1", action: PackageAction.AddOrUpdate },
      { pkg: pkgB, pkgId: "pkg2-ns2", action: PackageAction.AddOrUpdate },
      { pkg: pkgC, pkgId: "pkg3-ns3", action: PackageAction.AddOrUpdate },
      { pkg: pkgD, pkgId: "pkg4-ns4", action: PackageAction.AddOrUpdate },
    ];

    // Create an array of promises for each update
    const promises = mockUpdates.map(
      ({ pkg, pkgId, action }) =>
        new Promise<void>((resolve, reject) => {
          setTimeout(async () => {
            try {
              await updateInMemoryAmbientPackageMap(pkg, pkgId, action);
              resolve();
            } catch (error) {
              reject(error);
            }
          }, 0);
        }),
    );

    // Wait for all updates to complete
    await Promise.all(promises);

    // Validate inMemoryAmbientPackageMap
    expect(Object.keys(inMemoryAmbientPackageMap).sort()).toEqual(
      ["pkg1-ns1", "pkg2-ns2", "pkg3-ns3", "pkg4-ns4"].sort(),
    );
    expect(inMemoryAmbientPackageMap["pkg1-ns1"].name).toBe("pkg1");
    expect(inMemoryAmbientPackageMap["pkg2-ns2"].name).toBe("pkg2");
    expect(inMemoryAmbientPackageMap["pkg3-ns3"].name).toBe("pkg3");
    expect(inMemoryAmbientPackageMap["pkg4-ns4"].name).toBe("pkg4");
    expect(log.error).not.toHaveBeenCalled();
  });

  it("should remove package correctly on action on AddOrUpdate", async () => {
    const pkg1: UDSPackage = {
      ...pkgMock,
      metadata: { ...pkgMock.metadata, name: "package-1", namespace: "ns1" },
      spec: {
        ...pkgMock.spec,
        network: {
          ...pkgMock.spec?.network,
          allow: [{ direction: Direction.Egress, remoteHost: "example.com" }],
        },
      },
    };
    const pkg2: UDSPackage = {
      ...pkgMock,
      metadata: { ...pkgMock.metadata, name: "package-2", namespace: "ns2" },
      spec: {
        ...pkgMock.spec,
        network: {
          ...pkgMock.spec?.network,
          allow: [{ direction: Direction.Egress, remoteHost: "example.com" }],
        },
      },
    };

    await updateInMemoryAmbientPackageMap(pkg1, "package-1-ns1", PackageAction.AddOrUpdate);
    await updateInMemoryAmbientPackageMap(pkg2, "package-2-ns2", PackageAction.AddOrUpdate);
    expect(Object.keys(inMemoryAmbientPackageMap).sort()).toEqual([
      "package-1-ns1",
      "package-2-ns2",
    ]);

    await updateInMemoryAmbientPackageMap(pkg1, "package-1-ns1", PackageAction.Remove);
    expect(Object.keys(inMemoryAmbientPackageMap)).toEqual(["package-2-ns2"]);
  });

  it("should throw on ambient host/port protocol conflicts and keep existing map unchanged", async () => {
    const pkgHttp: UDSPackage = {
      ...pkgMock,
      metadata: { ...pkgMock.metadata, name: "pkg-06", namespace: "uds-egress-06" },
      spec: {
        ...pkgMock.spec,
        network: {
          ...pkgMock.spec?.network,
          allow: [
            {
              direction: Direction.Egress,
              remoteHost: "host-c.com",
              remoteProtocol: RemoteProtocol.HTTP,
              ports: [443],
            },
          ],
        },
      },
    };

    const pkgTls: UDSPackage = {
      ...pkgMock,
      metadata: { ...pkgMock.metadata, name: "pkg-07", namespace: "uds-egress-07" },
      spec: {
        ...pkgMock.spec,
        network: {
          ...pkgMock.spec?.network,
          allow: [
            {
              direction: Direction.Egress,
              remoteHost: "host-c.com",
              remoteProtocol: RemoteProtocol.TLS,
              ports: [443],
            },
          ],
        },
      },
    };

    await updateInMemoryAmbientPackageMap(
      pkgHttp,
      "pkg-06-uds-egress-06",
      PackageAction.AddOrUpdate,
    );
    expect(Object.keys(inMemoryAmbientPackageMap)).toEqual(["pkg-06-uds-egress-06"]);

    await expect(
      updateInMemoryAmbientPackageMap(pkgTls, "pkg-07-uds-egress-07", PackageAction.AddOrUpdate),
    ).rejects.toThrow(/Protocol conflict detected/);

    // Ensure we did not add or mutate the existing entry
    expect(Object.keys(inMemoryAmbientPackageMap)).toEqual(["pkg-06-uds-egress-06"]);
    expect(inMemoryAmbientPackageMap["pkg-06-uds-egress-06"].namespace).toBe("uds-egress-06");
  });
});

describe("test createHostResourceMap", () => {
  it("should create a host resource map from a package", () => {
    const allowMock = [
      {
        direction: Direction.Egress,
        remoteHost: "example.com",
        remoteProtocol: RemoteProtocol.TLS,
        port: 443,
      },
      {
        direction: Direction.Egress,
        remoteHost: "example.com",
        remoteProtocol: RemoteProtocol.HTTP,
        port: 80,
      },
      {
        direction: Direction.Egress,
        remoteHost: "another-example.com",
        remoteProtocol: RemoteProtocol.TLS,
        port: 8080,
      },
    ];

    const testPkg = {
      ...pkgMock,
      spec: {
        ...pkgMock.spec,
        network: {
          ...pkgMock.spec?.network,
          allow: allowMock,
        },
      },
    };

    const hostResourceMap = createHostResourceMap(testPkg);

    expect(hostResourceMap).toEqual({
      "example.com": {
        portProtocol: [
          { port: 443, protocol: RemoteProtocol.TLS },
          { port: 80, protocol: RemoteProtocol.HTTP },
        ],
      },
      "another-example.com": {
        portProtocol: [{ port: 8080, protocol: RemoteProtocol.TLS }],
      },
    });
  });

  it("should handle ports instead of port", () => {
    const allowMock = [
      {
        direction: Direction.Egress,
        remoteHost: "example.com",
        remoteProtocol: RemoteProtocol.TLS,
        ports: [443, 8443],
      },
    ];

    const testPkg = {
      ...pkgMock,
      spec: {
        ...pkgMock.spec,
        network: {
          ...pkgMock.spec?.network,
          allow: allowMock,
        },
      },
    };

    const hostResourceMap = createHostResourceMap(testPkg);

    expect(hostResourceMap).toEqual({
      "example.com": {
        portProtocol: [
          { port: 443, protocol: RemoteProtocol.TLS },
          { port: 8443, protocol: RemoteProtocol.TLS },
        ],
      },
    });
  });

  it("should return undefined for no allow egress rules", () => {
    const nonEgressAllowMock = [
      {
        direction: Direction.Ingress,
        selector: {
          app: "my-app",
        },
        port: 80,
        remoteGenerated: RemoteGenerated.Anywhere,
      },
    ];

    const testPkg = {
      ...pkgMock,
      spec: {
        ...pkgMock.spec,
        network: {
          ...pkgMock.spec?.network,
          allow: nonEgressAllowMock,
        },
      },
    };

    const hostResourceMap = createHostResourceMap(testPkg);
    expect(hostResourceMap).toBeUndefined();
  });

  it("should skip UDP Anywhere rules in ambient package entry", () => {
    const allowMock = [
      {
        direction: Direction.Egress,
        remoteGenerated: RemoteGenerated.Anywhere,
        remoteProtocol: RemoteProtocol.UDP,
        port: 53,
        serviceAccount: "test-sa",
      },
      {
        direction: Direction.Egress,
        remoteGenerated: RemoteGenerated.Anywhere,
        remoteProtocol: RemoteProtocol.TCP,
        port: 8080,
        serviceAccount: "test-sa",
      },
    ];

    const testPkg = {
      ...pkgMock,
      spec: {
        ...pkgMock.spec,
        network: {
          ...pkgMock.spec?.network,
          allow: allowMock,
        },
      },
    };

    const entry = createAmbientPackageEntry(testPkg);
    // Only TCP Anywhere rule should be present, UDP should be filtered out
    expect(entry.rules).toHaveLength(1);
    expect(entry.rules[0]).toEqual({
      kind: "anywhere",
      ports: [8080],
      serviceAccount: "test-sa",
    });
  });

  it("should handle empty package spec", () => {
    const hostResourceMap = createHostResourceMap(pkgMock);
    expect(hostResourceMap).toBeUndefined();
  });
});

describe("test getHostPortsProtocol", () => {
  it("should return tls hostPortsProtocol object", () => {
    const allow = {
      direction: Direction.Egress,
      remoteHost: "example.com",
      remoteProtocol: RemoteProtocol.TLS,
      ports: [443, 8443],
    };

    const result = getHostPortsProtocol(allow);

    expect(result).toEqual({
      host: "example.com",
      ports: [443, 8443],
      protocol: RemoteProtocol.TLS,
    });
  });

  it("should return undefined for non-egress spec", () => {
    const allow = {
      direction: Direction.Ingress,
      port: 80,
      remoteGenerated: RemoteGenerated.Anywhere,
      selector: { app: "my-app" },
    };

    const result = getHostPortsProtocol(allow);

    expect(result).toBeUndefined();
  });

  it("should return defaults for unspecified port", () => {
    const allow = {
      direction: Direction.Egress,
      remoteHost: "example.com",
      remoteProtocol: RemoteProtocol.TLS,
    };

    const result = getHostPortsProtocol(allow);

    expect(result).toEqual({
      host: "example.com",
      ports: [443],
      protocol: RemoteProtocol.TLS,
    });
  });

  it("should default to port 80 for HTTP when unspecified port", () => {
    const allow = {
      direction: Direction.Egress,
      remoteHost: "example.com",
      remoteProtocol: RemoteProtocol.HTTP,
    };

    const result = getHostPortsProtocol(allow);

    expect(result).toEqual({
      host: "example.com",
      ports: [80],
      protocol: RemoteProtocol.HTTP,
    });
  });

  it("should return defaults for unspecified protocol", () => {
    const allow = {
      direction: Direction.Egress,
      remoteHost: "example.com",
      port: 443,
    };

    const result = getHostPortsProtocol(allow);

    expect(result).toEqual({
      host: "example.com",
      ports: [443],
      protocol: RemoteProtocol.TLS, // Should default to TLS
    });
  });

  it("should handle allow with no remoteHos", () => {
    const allow = {
      direction: Direction.Egress,
      port: 80,
      remoteProtocol: RemoteProtocol.HTTP,
    };

    const result = getHostPortsProtocol(allow);

    expect(result).toBeUndefined();
  });

  it("should handle allow with both port and ports defined", () => {
    const allow = {
      direction: Direction.Egress,
      remoteHost: "example.com",
      remoteProtocol: RemoteProtocol.TLS,
      port: 443,
      ports: [8443, 9443],
    };

    const result = getHostPortsProtocol(allow);

    // Should prioritize ports over port
    expect(result).toEqual({
      host: "example.com",
      ports: [8443, 9443],
      protocol: RemoteProtocol.TLS,
    });
  });
});

describe("test validateProtocolConflicts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should not throw error when no conflicts exist", () => {
    const currentPackageMap: PackageHostMap = {
      package1: {
        "example.com": {
          portProtocol: [{ port: 443, protocol: RemoteProtocol.TLS }],
        },
      },
    };

    const newHostResourceMap: HostResourceMap = {
      "example.com": {
        portProtocol: [{ port: 80, protocol: RemoteProtocol.HTTP }],
      },
    };

    expect(() => {
      validateProtocolConflicts(currentPackageMap, newHostResourceMap, "package2");
    }).not.toThrow();
  });

  it("should not throw error when updating the same package", () => {
    const currentPackageMap: PackageHostMap = {
      package1: {
        "example.com": {
          portProtocol: [{ port: 443, protocol: RemoteProtocol.TLS }],
        },
      },
    };

    const newHostResourceMap: HostResourceMap = {
      "example.com": {
        portProtocol: [{ port: 443, protocol: RemoteProtocol.HTTP }],
      },
    };

    // Should not throw when updating the same package (package1)
    expect(() => {
      validateProtocolConflicts(currentPackageMap, newHostResourceMap, "package1");
    }).not.toThrow();
  });

  it("should throw error when protocol conflict exists", () => {
    const currentPackageMap: PackageHostMap = {
      package1: {
        "example.com": {
          portProtocol: [{ port: 443, protocol: RemoteProtocol.TLS }],
        },
      },
    };

    const newHostResourceMap: HostResourceMap = {
      "example.com": {
        portProtocol: [{ port: 443, protocol: RemoteProtocol.HTTP }],
      },
    };

    expect(() => {
      validateProtocolConflicts(currentPackageMap, newHostResourceMap, "package2");
    }).toThrow(
      'Protocol conflict detected for example.com:443. Package "package2" wants to use HTTP but package "package1" is already using TLS for the same host and port combination.',
    );
  });

  it("should allow same protocol on same host/port from different packages", () => {
    const currentPackageMap: PackageHostMap = {
      package1: {
        "example.com": {
          portProtocol: [{ port: 443, protocol: RemoteProtocol.TLS }],
        },
      },
    };

    const newHostResourceMap: HostResourceMap = {
      "example.com": {
        portProtocol: [{ port: 443, protocol: RemoteProtocol.TLS }],
      },
    };

    expect(() => {
      validateProtocolConflicts(currentPackageMap, newHostResourceMap, "package2");
    }).not.toThrow();
  });

  it("should handle multiple hosts and ports correctly", () => {
    const currentPackageMap: PackageHostMap = {
      package1: {
        "example.com": {
          portProtocol: [
            { port: 443, protocol: RemoteProtocol.TLS },
            { port: 80, protocol: RemoteProtocol.HTTP },
          ],
        },
        "another.com": {
          portProtocol: [{ port: 8080, protocol: RemoteProtocol.HTTP }],
        },
      },
    };

    const newHostResourceMap: HostResourceMap = {
      "example.com": {
        portProtocol: [
          { port: 443, protocol: RemoteProtocol.TLS }, // Same protocol - OK
          { port: 8443, protocol: RemoteProtocol.TLS }, // Different port - OK
        ],
      },
      "another.com": {
        portProtocol: [{ port: 9090, protocol: RemoteProtocol.HTTP }], // Different port - OK
      },
    };

    expect(() => {
      validateProtocolConflicts(currentPackageMap, newHostResourceMap, "package2");
    }).not.toThrow();
  });

  it("should detect conflict in complex scenario", () => {
    const currentPackageMap: PackageHostMap = {
      package1: {
        "example.com": {
          portProtocol: [
            { port: 443, protocol: RemoteProtocol.TLS },
            { port: 80, protocol: RemoteProtocol.HTTP },
          ],
        },
      },
      package2: {
        "another.com": {
          portProtocol: [{ port: 8080, protocol: RemoteProtocol.HTTP }],
        },
      },
    };

    const newHostResourceMap: HostResourceMap = {
      "example.com": {
        portProtocol: [{ port: 80, protocol: RemoteProtocol.TLS }], // Conflict: port 80 is HTTP in package1
      },
    };

    expect(() => {
      validateProtocolConflicts(currentPackageMap, newHostResourceMap, "package3");
    }).toThrow(
      'Protocol conflict detected for example.com:80. Package "package3" wants to use TLS but package "package1" is already using HTTP for the same host and port combination.',
    );
  });

  it("should handle empty package map", () => {
    const currentPackageMap: PackageHostMap = {};

    const newHostResourceMap: HostResourceMap = {
      "example.com": {
        portProtocol: [{ port: 443, protocol: RemoteProtocol.TLS }],
      },
    };

    expect(() => {
      validateProtocolConflicts(currentPackageMap, newHostResourceMap, "package1");
    }).not.toThrow();
  });
});

describe("test validateProtocolConflicts (ambient)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return correct results when no conflicts exist", () => {
    const currentPackageMap: PackageHostMap = {
      package1: {
        "example.com": {
          portProtocol: [{ port: 443, protocol: RemoteProtocol.TLS }],
        },
      },
    };

    const newHostResourceMap: HostResourceMap = {
      "httpbin.org": {
        portProtocol: [{ port: 80, protocol: RemoteProtocol.HTTP }],
      },
    };

    expect(() => {
      validateProtocolConflicts(currentPackageMap, newHostResourceMap, "package2");
    }).not.toThrow();
  });

  it("should return correct results when updating the same package", () => {
    const currentPackageMap: PackageHostMap = {
      package1: {
        "example.com": {
          portProtocol: [{ port: 443, protocol: RemoteProtocol.TLS }],
        },
      },
    };

    const newHostResourceMap: HostResourceMap = {
      "example.com": {
        portProtocol: [{ port: 80, protocol: RemoteProtocol.TLS }],
      },
    };

    expect(() => {
      validateProtocolConflicts(currentPackageMap, newHostResourceMap, "package1");
    }).not.toThrow();
  });

  it("should allow union of different ports/protocols for the same host", () => {
    const currentPackageMap: PackageHostMap = {
      package1: {
        "example.com": {
          portProtocol: [{ port: 443, protocol: RemoteProtocol.TLS }],
        },
      },
    };

    const newHostResourceMap: HostResourceMap = {
      "example.com": {
        portProtocol: [{ port: 80, protocol: RemoteProtocol.TLS }],
      },
    };

    expect(() => {
      validateProtocolConflicts(currentPackageMap, newHostResourceMap, "package2");
    }).not.toThrow();
  });

  it("should throw an error when a protocol conflict exists for the same host+port", () => {
    const currentPackageMap: PackageHostMap = {
      package1: {
        "example.com": {
          portProtocol: [{ port: 443, protocol: RemoteProtocol.TLS }],
        },
      },
    };

    const newHostResourceMap: HostResourceMap = {
      "example.com": {
        portProtocol: [{ port: 443, protocol: RemoteProtocol.HTTP }],
      },
    };

    expect(() => {
      validateProtocolConflicts(currentPackageMap, newHostResourceMap, "package2");
    }).toThrow(
      'Protocol conflict detected for example.com:443. Package "package2" wants to use HTTP but package "package1" is already using TLS for the same host and port combination.',
    );
  });

  it("should allow subset updates (union happens at remap time)", () => {
    const currentPackageMap: PackageHostMap = {
      package1: {
        "example.com": {
          portProtocol: [
            { port: 443, protocol: RemoteProtocol.TLS },
            { port: 80, protocol: RemoteProtocol.HTTP },
          ],
        },
      },
    };

    const newHostResourceMap: HostResourceMap = {
      "example.com": {
        portProtocol: [{ port: 80, protocol: RemoteProtocol.HTTP }],
      },
    };

    expect(() => {
      validateProtocolConflicts(currentPackageMap, newHostResourceMap, "package2");
    }).not.toThrow();
  });

  it("should return expected output when multiple packages/multiple hosts", () => {
    const currentPackageMap: PackageHostMap = {
      package1: {
        "example.com": {
          portProtocol: [
            { port: 443, protocol: RemoteProtocol.TLS },
            { port: 80, protocol: RemoteProtocol.HTTP },
          ],
        },
      },
      package2: {
        "httpbin.org": {
          portProtocol: [
            { port: 443, protocol: RemoteProtocol.TLS },
            { port: 80, protocol: RemoteProtocol.HTTP },
          ],
        },
      },
      package3: {
        "github.com": {
          portProtocol: [{ port: 443, protocol: RemoteProtocol.TLS }],
        },
      },
    };

    const newHostResourceMap: HostResourceMap = {
      "httpbin.org": {
        portProtocol: [{ port: 80, protocol: RemoteProtocol.HTTP }],
      },
      "example.com": {
        portProtocol: [{ port: 443, protocol: RemoteProtocol.TLS }],
      },
    };

    expect(() => {
      validateProtocolConflicts(currentPackageMap, newHostResourceMap, "package4");
    }).not.toThrow();
  });
});

describe("test removeMapResources", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset the map before each test
    for (const key in inMemoryPackageMap) {
      delete inMemoryPackageMap[key];
    }
  });

  it("should remove existing package from inMemoryPackageMap", () => {
    const hostResourceMap: HostResourceMap = {
      "example.com": {
        portProtocol: [{ port: 443, protocol: RemoteProtocol.TLS }],
      },
    };

    // Add a package to the map
    inMemoryPackageMap["test-package"] = hostResourceMap;
    expect(inMemoryPackageMap).toHaveProperty("test-package");

    // Remove the package
    removeMapResources(inMemoryPackageMap, "test-package");

    // Verify it's removed
    expect(inMemoryPackageMap).not.toHaveProperty("test-package");
    expect(inMemoryPackageMap).toEqual({});
  });

  it("should handle removal of non-existent package gracefully", () => {
    // Try to remove a package that doesn't exist
    removeMapResources(inMemoryPackageMap, "non-existent-package");

    // Should not throw and map should remain empty
    expect(inMemoryPackageMap).toEqual({});
  });

  it("should only remove specified package and leave others intact", () => {
    const hostResourceMap1: HostResourceMap = {
      "example.com": {
        portProtocol: [{ port: 443, protocol: RemoteProtocol.TLS }],
      },
    };

    const hostResourceMap2: HostResourceMap = {
      "another.com": {
        portProtocol: [{ port: 80, protocol: RemoteProtocol.HTTP }],
      },
    };

    // Add multiple packages
    inMemoryPackageMap["package1"] = hostResourceMap1;
    inMemoryPackageMap["package2"] = hostResourceMap2;

    // Remove only one package
    removeMapResources(inMemoryPackageMap, "package1");

    // Verify only the specified package is removed
    expect(inMemoryPackageMap).not.toHaveProperty("package1");
    expect(inMemoryPackageMap).toHaveProperty("package2");
    expect(inMemoryPackageMap["package2"]).toEqual(hostResourceMap2);
  });
});

describe("test egressRequestedFromNetwork", () => {
  it("should return a subset of items from allow", () => {
    const allowList = [
      {
        direction: Direction.Ingress,
        port: 443,
      },
      {
        direction: Direction.Egress,
        remoteHost: "example.com",
        remoteProtocol: RemoteProtocol.HTTP,
        port: 80,
      },
    ];

    const egressAllowList = egressRequestedFromNetwork(allowList);

    expect(egressAllowList).toHaveLength(1);
  });

  it("should return no items from allow", () => {
    const allowList = [
      {
        direction: Direction.Ingress,
        port: 443,
      },
    ];

    const egressAllowList = egressRequestedFromNetwork(allowList);

    expect(egressAllowList).toHaveLength(0);
  });
});

describe("initial shared egress hydration", () => {
  const sidecarPackage = (name: string, overrides: Partial<UDSPackage> = {}): UDSPackage => ({
    ...pkgMock,
    ...overrides,
    metadata: {
      ...pkgMock.metadata,
      ...overrides.metadata,
      name,
      namespace: "test-namespace",
    },
    spec: {
      ...pkgMock.spec,
      ...overrides.spec,
      network: {
        ...pkgMock.spec?.network,
        ...overrides.spec?.network,
        serviceMesh: { mode: Mode.Sidecar },
        allow: overrides.spec?.network?.allow ?? [
          {
            direction: Direction.Egress,
            remoteHost: "example.com",
            remoteProtocol: RemoteProtocol.TLS,
            port: 443,
          },
        ],
      },
    },
  });

  const ambientPackage = (name: string, overrides: Partial<UDSPackage> = {}): UDSPackage => ({
    ...sidecarPackage(name, overrides),
    spec: {
      ...sidecarPackage(name, overrides).spec,
      network: {
        ...sidecarPackage(name, overrides).spec?.network,
        serviceMesh: { mode: Mode.Ambient },
      },
    },
  });

  beforeEach(() => {
    vi.clearAllMocks();
    updateEgressMocks(defaultEgressMocks);
    for (const key of Object.keys(inMemoryPackageMap)) delete inMemoryPackageMap[key];
    for (const key of Object.keys(inMemoryAmbientPackageMap)) {
      delete inMemoryAmbientPackageMap[key];
    }
    vi.mocked(applySidecarEgressResources).mockResolvedValue();
    vi.mocked(applyAmbientEgressResources).mockResolvedValue();
    vi.mocked(purgeAmbientEgressResources).mockImplementation(async () => {});
    (purgeOrphans as Mock).mockImplementation(async () => {});
  });

  it("applies a live sidecar package before purging on a no-egress event", async () => {
    const livePackage = sidecarPackage("live-sidecar");
    const loader = vi.fn().mockResolvedValue({ items: [livePackage] });

    await reconcileSharedEgressResources(
      sidecarPackage("event-package", {
        spec: { network: { allow: [] } },
      }),
      undefined,
      PackageAction.AddOrUpdate,
      Mode.Sidecar,
      loader,
    );

    expect(applySidecarEgressResources).toHaveBeenCalledWith(
      expect.objectContaining({ "live-sidecar-test-namespace": expect.anything() }),
      expect.any(Number),
    );
    expect((applySidecarEgressResources as Mock).mock.calls[0][0]).not.toHaveProperty(
      "event-package-test-namespace",
    );
    expect(purgeOrphans).toHaveBeenCalled();
  });

  it("applies a live ambient package before purging on a no-egress event", async () => {
    const livePackage = ambientPackage("live-ambient");
    const loader = vi.fn().mockResolvedValue({ items: [livePackage] });

    await reconcileSharedEgressResources(
      ambientPackage("event-package"),
      undefined,
      PackageAction.AddOrUpdate,
      Mode.Ambient,
      loader,
    );

    expect(applyAmbientEgressResources).toHaveBeenCalledWith(
      expect.objectContaining({ "live-ambient-test-namespace": expect.anything() }),
      expect.any(Number),
    );
    expect((applyAmbientEgressResources as Mock).mock.calls[0][0]).not.toHaveProperty(
      "event-package-test-namespace",
    );
    expect(purgeAmbientEgressResources).toHaveBeenCalled();
  });

  it("excludes packages being deleted from the hydrated maps", async () => {
    const deletingPackage = sidecarPackage("deleting-sidecar", {
      metadata: { ...pkgMock.metadata, name: "deleting-sidecar", deletionTimestamp: new Date() },
    });
    const loader = vi
      .fn()
      .mockResolvedValue({ items: [sidecarPackage("live-sidecar"), deletingPackage] });

    await reconcileSharedEgressResources(
      sidecarPackage("event-package", { spec: { network: { allow: [] } } }),
      undefined,
      PackageAction.AddOrUpdate,
      Mode.Sidecar,
      loader,
    );

    expect(inMemoryPackageMap).toHaveProperty("live-sidecar-test-namespace");
    expect(inMemoryPackageMap).not.toHaveProperty("deleting-sidecar-test-namespace");
    expect(purgeOrphans).toHaveBeenCalled();
  });

  it("isolates a conflicting sidecar package and applies all accepted packages", async () => {
    const acceptedPackage = sidecarPackage("package-a", {
      metadata: {
        ...pkgMock.metadata,
        creationTimestamp: new Date("2026-01-01T00:00:00Z"),
      },
    });
    const rejectedPackage = sidecarPackage("package-b", {
      metadata: {
        ...pkgMock.metadata,
        creationTimestamp: new Date("2026-01-02T00:00:00Z"),
      },
      spec: {
        network: {
          allow: [
            {
              direction: Direction.Egress,
              remoteHost: "example.com",
              remoteProtocol: RemoteProtocol.HTTP,
              port: 443,
            },
          ],
        },
      },
    });
    const unrelatedPackage = sidecarPackage("package-c", {
      spec: {
        network: {
          allow: [
            {
              direction: Direction.Egress,
              remoteHost: "unrelated.example.com",
              remoteProtocol: RemoteProtocol.TLS,
              port: 443,
            },
          ],
        },
      },
    });
    const loader = vi
      .fn()
      .mockResolvedValue({ items: [rejectedPackage, unrelatedPackage, acceptedPackage] });

    await reconcileSharedEgressResources(
      unrelatedPackage,
      createHostResourceMap(unrelatedPackage),
      PackageAction.AddOrUpdate,
      Mode.Sidecar,
      loader,
    );

    expect(inMemoryPackageMap).toHaveProperty("package-a-test-namespace");
    expect(inMemoryPackageMap).toHaveProperty("package-c-test-namespace");
    expect(inMemoryPackageMap).not.toHaveProperty("package-b-test-namespace");
    expect(applySidecarEgressResources).toHaveBeenCalledWith(
      inMemoryPackageMap,
      expect.any(Number),
    );
    expect(purgeOrphans).toHaveBeenCalled();
  });

  it("isolates a conflicting ambient package and applies all accepted packages", async () => {
    const acceptedPackage = ambientPackage("package-a", {
      metadata: {
        ...pkgMock.metadata,
        creationTimestamp: new Date("2026-01-01T00:00:00Z"),
      },
    });
    const rejectedPackage = ambientPackage("package-b", {
      metadata: {
        ...pkgMock.metadata,
        creationTimestamp: new Date("2026-01-02T00:00:00Z"),
      },
      spec: {
        network: {
          allow: [
            {
              direction: Direction.Egress,
              remoteHost: "example.com",
              remoteProtocol: RemoteProtocol.HTTP,
              port: 443,
            },
          ],
        },
      },
    });
    const unrelatedPackage = ambientPackage("package-c", {
      spec: {
        network: {
          allow: [
            {
              direction: Direction.Egress,
              remoteHost: "unrelated.example.com",
              remoteProtocol: RemoteProtocol.TLS,
              port: 443,
            },
          ],
        },
      },
    });
    const loader = vi
      .fn()
      .mockResolvedValue({ items: [rejectedPackage, unrelatedPackage, acceptedPackage] });

    await reconcileSharedEgressResources(
      unrelatedPackage,
      undefined,
      PackageAction.AddOrUpdate,
      Mode.Ambient,
      loader,
    );

    expect(inMemoryAmbientPackageMap).toHaveProperty("package-a-test-namespace");
    expect(inMemoryAmbientPackageMap).toHaveProperty("package-c-test-namespace");
    expect(inMemoryAmbientPackageMap).not.toHaveProperty("package-b-test-namespace");
    expect(applyAmbientEgressResources).toHaveBeenCalledWith(
      inMemoryAmbientPackageMap,
      expect.any(Number),
    );
    expect(purgeAmbientEgressResources).toHaveBeenCalled();
  });

  it("uses deterministic fallback ordering independent of list order", () => {
    const olderPackage = sidecarPackage("older-package", {
      metadata: {
        ...pkgMock.metadata,
        creationTimestamp: new Date("2026-01-01T00:00:00Z"),
      },
    });
    const newerPackage = sidecarPackage("newer-package", {
      metadata: {
        ...pkgMock.metadata,
        creationTimestamp: new Date("2026-01-02T00:00:00Z"),
      },
      spec: {
        network: {
          allow: [
            {
              direction: Direction.Egress,
              remoteHost: "example.com",
              remoteProtocol: RemoteProtocol.HTTP,
              port: 443,
            },
          ],
        },
      },
    });

    const forward = buildEgressMaps([olderPackage, newerPackage]);
    const reverse = buildEgressMaps([newerPackage, olderPackage]);

    expect(forward.sidecarMap).toEqual(reverse.sidecarMap);
    expect(forward.sidecarMap).toHaveProperty("older-package-test-namespace");
    expect(forward.sidecarMap).not.toHaveProperty("newer-package-test-namespace");
    expect([...forward.conflicts.keys()]).toEqual(["newer-package-test-namespace"]);
    expect([...reverse.conflicts.keys()]).toEqual(["newer-package-test-namespace"]);
  });

  it("preserves a current successfully reconciled owner independent of list order", () => {
    const olderFailedPackage = sidecarPackage("older-failed-package", {
      metadata: {
        ...pkgMock.metadata,
        creationTimestamp: new Date("2026-01-01T00:00:00Z"),
        generation: 2,
      },
      status: {
        phase: Phase.Failed,
        observedGeneration: 1,
      },
    });
    const newerReadyPackage = sidecarPackage("newer-ready-package", {
      metadata: {
        ...pkgMock.metadata,
        creationTimestamp: new Date("2026-01-02T00:00:00Z"),
        generation: 1,
      },
      status: {
        phase: Phase.Ready,
        observedGeneration: 1,
      },
      spec: {
        network: {
          allow: [
            {
              direction: Direction.Egress,
              remoteHost: "example.com",
              remoteProtocol: RemoteProtocol.HTTP,
              port: 443,
            },
          ],
        },
      },
    });

    const forward = buildEgressMaps([olderFailedPackage, newerReadyPackage]);
    const reverse = buildEgressMaps([newerReadyPackage, olderFailedPackage]);

    expect(forward.sidecarMap).toEqual(reverse.sidecarMap);
    expect(forward.sidecarMap).toHaveProperty("newer-ready-package-test-namespace");
    expect(forward.sidecarMap).not.toHaveProperty("older-failed-package-test-namespace");
    expect([...forward.conflicts.keys()]).toEqual(["older-failed-package-test-namespace"]);
    expect([...reverse.conflicts.keys()]).toEqual(["older-failed-package-test-namespace"]);
  });

  it("applies and purges accepted state before rejecting the triggering package", async () => {
    const acceptedPackage = sidecarPackage("package-a", {
      metadata: {
        ...pkgMock.metadata,
        creationTimestamp: new Date("2026-01-01T00:00:00Z"),
      },
    });
    const rejectedPackage = sidecarPackage("package-b", {
      metadata: {
        ...pkgMock.metadata,
        creationTimestamp: new Date("2026-01-02T00:00:00Z"),
      },
      spec: {
        network: {
          allow: [
            {
              direction: Direction.Egress,
              remoteHost: "example.com",
              remoteProtocol: RemoteProtocol.HTTP,
              port: 443,
            },
          ],
        },
      },
    });
    const loader = vi.fn().mockResolvedValue({ items: [rejectedPackage, acceptedPackage] });

    await expect(
      reconcileSharedEgressResources(
        rejectedPackage,
        createHostResourceMap(rejectedPackage),
        PackageAction.AddOrUpdate,
        Mode.Sidecar,
        loader,
      ),
    ).rejects.toThrow("Protocol conflict detected");

    expect(inMemoryPackageMap).toHaveProperty("package-a-test-namespace");
    expect(inMemoryPackageMap).not.toHaveProperty("package-b-test-namespace");
    expect(applySidecarEgressResources).toHaveBeenCalled();
    expect(purgeOrphans).toHaveBeenCalled();
  });

  it("does not promote a rejected package when its incumbent is updated or deleted", async () => {
    const acceptedPackage = sidecarPackage("package-a", {
      metadata: {
        ...pkgMock.metadata,
        creationTimestamp: new Date("2026-01-01T00:00:00Z"),
      },
    });
    const rejectedPackage = sidecarPackage("package-b", {
      metadata: {
        ...pkgMock.metadata,
        creationTimestamp: new Date("2026-01-02T00:00:00Z"),
      },
      spec: {
        network: {
          allow: [
            {
              direction: Direction.Egress,
              remoteHost: "example.com",
              remoteProtocol: RemoteProtocol.HTTP,
              port: 443,
            },
          ],
        },
      },
    });
    const triggerPackage = sidecarPackage("package-c", { spec: { network: { allow: [] } } });
    const loader = vi.fn().mockResolvedValue({ items: [rejectedPackage, acceptedPackage] });
    await reconcileSharedEgressResources(
      triggerPackage,
      undefined,
      PackageAction.AddOrUpdate,
      Mode.Sidecar,
      loader,
    );

    const updatedHostResourceMap = {
      "updated.example.com": {
        portProtocol: [{ port: 443, protocol: RemoteProtocol.TLS }],
      },
    };
    await reconcileSharedEgressResources(
      acceptedPackage,
      updatedHostResourceMap,
      PackageAction.AddOrUpdate,
      Mode.Sidecar,
      loader,
    );
    expect(inMemoryPackageMap).toEqual({
      "package-a-test-namespace": updatedHostResourceMap,
    });

    await reconcileSharedEgressResources(
      acceptedPackage,
      updatedHostResourceMap,
      PackageAction.Remove,
      Mode.Sidecar,
      loader,
    );
    expect(inMemoryPackageMap).toEqual({});
  });

  it("keeps non-conflict hydration failures atomic and retryable", async () => {
    const existingSidecar = { existing: { "existing.example.com": { portProtocol: [] } } };
    const existingAmbient = {
      ambient: { name: "ambient", namespace: "existing", rules: [] },
    };
    Object.assign(inMemoryPackageMap, existingSidecar);
    Object.assign(inMemoryAmbientPackageMap, existingAmbient);
    const invalidPackage = sidecarPackage("invalid");
    invalidPackage.metadata!.name = undefined;
    const loader = vi
      .fn()
      .mockResolvedValueOnce({ items: [invalidPackage] })
      .mockResolvedValueOnce({ items: [sidecarPackage("package-a")] });

    await expect(
      reconcileSharedEgressResources(
        sidecarPackage("event-package", { spec: { network: { allow: [] } } }),
        undefined,
        PackageAction.AddOrUpdate,
        Mode.Sidecar,
        loader,
      ),
    ).rejects.toThrow("Package metadata.name and metadata.namespace are required");

    expect(inMemoryPackageMap).toEqual(existingSidecar);
    expect(inMemoryAmbientPackageMap).toEqual(existingAmbient);
    expect(applySidecarEgressResources).not.toHaveBeenCalled();
    expect(applyAmbientEgressResources).not.toHaveBeenCalled();
    expect(purgeOrphans).not.toHaveBeenCalled();
    expect(purgeAmbientEgressResources).not.toHaveBeenCalled();

    await reconcileSharedEgressResources(
      sidecarPackage("event-package", { spec: { network: { allow: [] } } }),
      undefined,
      PackageAction.AddOrUpdate,
      Mode.Sidecar,
      loader,
    );

    expect(loader).toHaveBeenCalledTimes(2);
    expect(inMemoryPackageMap).toHaveProperty("package-a-test-namespace");
  });

  it("leaves maps unchanged and retries when the package list fails", async () => {
    const existing = { existing: { "existing.example.com": { portProtocol: [] } } };
    const existingAmbient = {
      ambient: { name: "ambient", namespace: "existing", rules: [] },
    };
    Object.assign(inMemoryPackageMap, existing);
    Object.assign(inMemoryAmbientPackageMap, existingAmbient);
    const loader = vi
      .fn()
      .mockRejectedValueOnce(new Error("package list unavailable"))
      .mockResolvedValueOnce({ items: [sidecarPackage("live-sidecar")] });

    await expect(
      reconcileSharedEgressResources(
        sidecarPackage("event-package", { spec: { network: { allow: [] } } }),
        undefined,
        PackageAction.AddOrUpdate,
        Mode.Sidecar,
        loader,
      ),
    ).rejects.toThrow("package list unavailable");

    expect(inMemoryPackageMap).toEqual(existing);
    expect(inMemoryAmbientPackageMap).toEqual(existingAmbient);
    expect(applySidecarEgressResources).not.toHaveBeenCalled();
    expect(applyAmbientEgressResources).not.toHaveBeenCalled();
    expect(purgeOrphans).not.toHaveBeenCalled();
    expect(purgeAmbientEgressResources).not.toHaveBeenCalled();

    await reconcileSharedEgressResources(
      sidecarPackage("event-package", { spec: { network: { allow: [] } } }),
      undefined,
      PackageAction.AddOrUpdate,
      Mode.Sidecar,
      loader,
    );

    expect(loader).toHaveBeenCalledTimes(2);
    expect(applySidecarEgressResources).toHaveBeenCalled();
  });
});
