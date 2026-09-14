/**
 * Copyright 2025-2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { kind } from "pepr";
import { afterEach, beforeEach, describe, expect, it, Mock, MockedFunction, vi } from "vitest";
import { Direction, RemoteGenerated, RemoteProtocol, UDSPackage } from "../../crd";
import { defaultEgressMocks, pkgMock, updateEgressMocks } from "./defaultTestMocks";
import {
  createAmbientPackageEntry,
  createHostResourceMap,
  egressRequestedFromNetwork,
  getHostPortsProtocol,
  inMemoryAmbientPackageMap,
  inMemoryPackageMap,
  performEgressReconciliation,
  reconcileSharedEgressResources,
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
import { Mode } from "../../crd/generated/package-v1alpha1";
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
        serviceMesh: { mode: Mode.Sidecar },
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
    updateEgressMocks(defaultEgressMocks);

    await reconcileSharedEgressResources(pkgWithAllow, PackageAction.AddOrUpdate, Mode.Sidecar);

    // Validate inMemoryPackageMap
    expect(inMemoryPackageMap).toEqual({ "test-package-test-namespace": hostResourceMapMock });

    // Validate inMemoryAmbientPackageMap
    expect(inMemoryAmbientPackageMap).toEqual({});
  });

  it("should populate in-memory vars on action AddOrUpdate, ambient", async () => {
    updateEgressMocks(defaultEgressMocks);

    await reconcileSharedEgressResources(pkgWithAllow, PackageAction.AddOrUpdate, Mode.Ambient);

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

    await reconcileSharedEgressResources(pkgWithAllow, PackageAction.AddOrUpdate, Mode.Sidecar);

    // Validate inMemoryPackageMap is populated
    expect(inMemoryPackageMap).toEqual({ "test-package-test-namespace": hostResourceMapMock });

    // Validate inMemoryAmbientPackageMap is still empty
    expect(inMemoryAmbientPackageMap).toEqual({});

    // Update to ambient
    await reconcileSharedEgressResources(pkgWithAllow, PackageAction.AddOrUpdate, Mode.Ambient);

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

    await reconcileSharedEgressResources(pkgWithAllow, PackageAction.AddOrUpdate, Mode.Ambient);

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

    await reconcileSharedEgressResources(pkgWithAllow, PackageAction.AddOrUpdate, Mode.Sidecar);

    // Validate inMemoryPackageMap is populated
    expect(inMemoryPackageMap).toEqual({ "test-package-test-namespace": hostResourceMapMock });

    // Validate inMemoryAmbientPackageMap is now empty
    expect(inMemoryAmbientPackageMap).toEqual({});
  });

  it("should update in-memory vars on action Remove, sidecar", async () => {
    updateEgressMocks(defaultEgressMocks);

    // Populate inMemoryPackageMap first
    await reconcileSharedEgressResources(pkgWithAllow, PackageAction.AddOrUpdate, Mode.Sidecar);

    // Validate inMemoryPackageMap is populated
    expect(inMemoryPackageMap).toEqual({ "test-package-test-namespace": hostResourceMapMock });

    // Validate inMemoryAmbientPackageMap is empty
    expect(inMemoryAmbientPackageMap).toEqual({});

    // Remove packageIdMock
    await reconcileSharedEgressResources(pkgWithAllow, PackageAction.Remove, Mode.Sidecar);

    // Validate inMemoryPackageMap is now empty
    expect(inMemoryPackageMap).toEqual({});

    // Validate inMemoryAmbientPackageMap is still empty
    expect(inMemoryAmbientPackageMap).toEqual({});
  });

  it("should update in-memory vars on action Remove, ambient", async () => {
    updateEgressMocks(defaultEgressMocks);

    // Populate inMemoryAmbientPackages first
    await reconcileSharedEgressResources(pkgWithAllow, PackageAction.AddOrUpdate, Mode.Ambient);

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
    await reconcileSharedEgressResources(pkgWithAllow, PackageAction.Remove, Mode.Ambient);

    // Validate inMemoryPackageMap is still empty
    expect(inMemoryPackageMap).toEqual({});

    // Validate inMemoryAmbientPackages is now empty
    expect(inMemoryAmbientPackageMap).toEqual({});
  });
});

describe("test shared egress reconciliation serialization", () => {
  const sharedHostResourceMap: HostResourceMap = {
    "example.com": {
      portProtocol: [{ port: 443, protocol: RemoteProtocol.TLS }],
    },
  };

  const packageWithHost = (name: string, host = "example.com"): UDSPackage => ({
    ...pkgMock,
    metadata: { ...pkgMock.metadata, name },
    spec: {
      ...pkgMock.spec,
      network: {
        ...pkgMock.spec?.network,
        serviceMesh: { mode: Mode.Sidecar },
        allow: [
          {
            direction: Direction.Egress,
            remoteHost: host,
            remoteProtocol: RemoteProtocol.TLS,
            port: 443,
          },
        ],
      },
    },
  });

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

  it("uses the complete live package set before applying and purging", async () => {
    updateEgressMocks(defaultEgressMocks);
    const firstPackage = packageWithHost("first-package");
    const secondPackage = packageWithHost("second-package");
    defaultEgressMocks.getPkgListMock.mockResolvedValue({
      items: [firstPackage, secondPackage],
    });

    await reconcileSharedEgressResources(firstPackage, PackageAction.AddOrUpdate, Mode.Sidecar);

    expect(applySidecarEgressResources).toHaveBeenCalledWith(
      expect.objectContaining({
        "first-package-test-namespace": sharedHostResourceMap,
        "second-package-test-namespace": sharedHostResourceMap,
      }),
      expect.any(Number),
    );
    expect(inMemoryPackageMap).toEqual({
      "first-package-test-namespace": sharedHostResourceMap,
      "second-package-test-namespace": sharedHostResourceMap,
    });
  });

  it("does not let an older package event override newer live state", async () => {
    updateEgressMocks(defaultEgressMocks);
    const livePackage = packageWithHost("first-package", "live.example.com");
    livePackage.metadata!.generation = 2;
    const staleEvent = packageWithHost("first-package", "stale.example.com");
    staleEvent.metadata!.generation = 1;
    defaultEgressMocks.getPkgListMock.mockResolvedValue({ items: [livePackage] });

    await reconcileSharedEgressResources(staleEvent, PackageAction.AddOrUpdate, Mode.Sidecar);

    expect(inMemoryPackageMap).toEqual({
      "first-package-test-namespace": createHostResourceMap(livePackage),
    });
  });

  it("removes a package from the desired set during teardown", async () => {
    updateEgressMocks(defaultEgressMocks);
    const packageToRemove = packageWithHost("package-to-remove");
    defaultEgressMocks.getPkgListMock.mockResolvedValue({ items: [packageToRemove] });

    await reconcileSharedEgressResources(packageToRemove, PackageAction.AddOrUpdate, Mode.Sidecar);
    expect(inMemoryPackageMap).toHaveProperty("package-to-remove-test-namespace");

    packageToRemove.metadata!.deletionTimestamp = new Date();
    await reconcileSharedEgressResources(packageToRemove, PackageAction.Remove, Mode.Sidecar);

    expect(inMemoryPackageMap).not.toHaveProperty("package-to-remove-test-namespace");
  });

  it("coalesces a queued package update without a partial-map purge", async () => {
    updateEgressMocks(defaultEgressMocks);
    const firstPackage = packageWithHost("first-package");
    const secondPackage = packageWithHost("second-package");
    defaultEgressMocks.getPkgListMock.mockResolvedValue({
      items: [firstPackage, secondPackage],
    });

    let releaseFirstApply!: () => void;
    let firstApplyStarted!: () => void;
    const firstApply = new Promise<void>(resolve => {
      releaseFirstApply = resolve;
    });
    const applyStarted = new Promise<void>(resolve => {
      firstApplyStarted = resolve;
    });
    vi.mocked(applySidecarEgressResources).mockImplementation(async packageMap => {
      firstApplyStarted();
      await firstApply;
      expect(packageMap).toEqual({
        "first-package-test-namespace": sharedHostResourceMap,
        "second-package-test-namespace": sharedHostResourceMap,
      });
    });

    const first = reconcileSharedEgressResources(
      firstPackage,
      PackageAction.AddOrUpdate,
      Mode.Sidecar,
    );
    const second = reconcileSharedEgressResources(
      secondPackage,
      PackageAction.AddOrUpdate,
      Mode.Sidecar,
    );

    await applyStarted;
    releaseFirstApply();
    await expect(Promise.all([first, second])).resolves.toEqual([undefined, undefined]);
    expect(inMemoryPackageMap).toEqual({
      "first-package-test-namespace": sharedHostResourceMap,
      "second-package-test-namespace": sharedHostResourceMap,
    });
  });

  it("retries a failed pass when another package is already queued", async () => {
    updateEgressMocks(defaultEgressMocks);
    const firstPackage = packageWithHost("first-package");
    const secondPackage = packageWithHost("second-package");
    defaultEgressMocks.getPkgListMock.mockResolvedValue({
      items: [firstPackage, secondPackage],
    });
    vi.mocked(applySidecarEgressResources)
      .mockRejectedValueOnce(new Error("transient apply failure"))
      .mockResolvedValueOnce();

    const first = reconcileSharedEgressResources(
      firstPackage,
      PackageAction.AddOrUpdate,
      Mode.Sidecar,
    );
    const second = reconcileSharedEgressResources(
      secondPackage,
      PackageAction.AddOrUpdate,
      Mode.Sidecar,
    );

    await expect(Promise.all([first, second])).resolves.toEqual([undefined, undefined]);
    expect(applySidecarEgressResources).toHaveBeenCalledTimes(2);
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
