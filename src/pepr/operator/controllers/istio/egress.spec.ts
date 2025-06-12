/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { kind } from "pepr";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  Mock,
  MockedFunction,
  test,
  vi,
} from "vitest";
import { Direction, IstioGateway, RemoteGenerated, RemoteProtocol } from "../../crd";
import { purgeOrphans } from "../utils";
import { defaultEgressMocks, pkgMock, updateEgressMocks } from "./defaultTestMocks";
import {
  applyEgressResources,
  createHostResourceMap,
  egressRequestedFromNetwork,
  getHostPortsProtocol,
  inMemoryPackageMap,
  performEgressReconciliation,
  performEgressReconciliationWithMutex,
  reconcileSharedEgressResources,
  remapEgressResources,
  removeEgressResources,
  updateInMemoryPackageMap,
  validateEgressGateway,
  validateProtocolConflicts,
} from "./egress";
import { HostResourceMap, PackageAction, PackageHostMap } from "./types";

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

const mockPurgeOrphans: MockedFunction<() => Promise<void>> = vi.fn();

// Mock the necessary functions
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
  },
}));
vi.mock("../utils", async () => {
  const originalModule = (await vi.importActual("../utils")) as object;
  return {
    ...originalModule,
    purgeOrphans: vi.fn(async <T>(fn: () => Promise<T>) => fn()),
  };
});

describe("test reconcileEgressResources", () => {
  const hostResourceMapMock: HostResourceMap = {
    "example.com": {
      portProtocol: [{ port: 443, protocol: RemoteProtocol.TLS }],
    },
  };
  const packageIdMock = "test-package-test-namespace";

  beforeEach(() => {
    process.env.PEPR_WATCH_MODE = "true";
    vi.useFakeTimers();
    vi.clearAllMocks();
    // Reset the map before each test
    for (const key in inMemoryPackageMap) {
      delete inMemoryPackageMap[key];
    }

    (purgeOrphans as Mock).mockImplementation(mockPurgeOrphans);
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("should create egress resources on action AddOrUpdate", async () => {
    updateEgressMocks(defaultEgressMocks);

    await reconcileSharedEgressResources(
      hostResourceMapMock,
      packageIdMock,
      PackageAction.AddOrUpdate,
    );

    // Check apply methods are called
    expect(defaultEgressMocks.applyGwMock).toHaveBeenCalledTimes(1);
    expect(defaultEgressMocks.applyVsMock).toHaveBeenCalledTimes(1);
    expect(defaultEgressMocks.applySeMock).toHaveBeenCalledTimes(1);

    // Validate inMemoryPackageMap
    expect(inMemoryPackageMap).toEqual({ "test-package-test-namespace": hostResourceMapMock });
  });

  it("should apply an updated set of egress resources on action AddOrUpdate", async () => {
    updateEgressMocks(defaultEgressMocks);

    await reconcileSharedEgressResources(
      hostResourceMapMock,
      packageIdMock,
      PackageAction.AddOrUpdate,
    );

    expect(defaultEgressMocks.applyGwMock).toHaveBeenCalledTimes(1);
    expect(defaultEgressMocks.applyVsMock).toHaveBeenCalledTimes(1);
    expect(defaultEgressMocks.applySeMock).toHaveBeenCalledTimes(1);

    // Check the value of inMemoryPackageMap
    expect(inMemoryPackageMap).toEqual({ "test-package-test-namespace": hostResourceMapMock });

    defaultEgressMocks.applyGwMock.mockClear();
    defaultEgressMocks.applyVsMock.mockClear();
    defaultEgressMocks.applySeMock.mockClear();

    // update the pkg
    const updatedHostResourceMapMock: HostResourceMap = {
      "example.com": {
        portProtocol: [{ port: 80, protocol: RemoteProtocol.HTTP }],
      },
    };

    await reconcileSharedEgressResources(
      updatedHostResourceMapMock,
      packageIdMock,
      PackageAction.AddOrUpdate,
    );

    expect(defaultEgressMocks.applyGwMock).toHaveBeenCalledTimes(1);
    expect(defaultEgressMocks.applyVsMock).toHaveBeenCalledTimes(1);
    expect(defaultEgressMocks.applySeMock).toHaveBeenCalledTimes(1);

    // Check the value of inMemoryPackageMap
    expect(inMemoryPackageMap).toEqual({
      "test-package-test-namespace": updatedHostResourceMapMock,
    });
  });

  it("should remove an old egress allow rule on action AddOrUpdate", async () => {
    updateEgressMocks(defaultEgressMocks);

    await reconcileSharedEgressResources(
      hostResourceMapMock,
      packageIdMock,
      PackageAction.AddOrUpdate,
    );

    expect(defaultEgressMocks.applyGwMock).toHaveBeenCalledTimes(1);
    expect(defaultEgressMocks.applyVsMock).toHaveBeenCalledTimes(1);
    expect(defaultEgressMocks.applySeMock).toHaveBeenCalledTimes(1);

    // Check the value of inMemoryPackageMap
    expect(inMemoryPackageMap).toEqual({ "test-package-test-namespace": hostResourceMapMock });

    defaultEgressMocks.applyGwMock.mockClear();
    defaultEgressMocks.applyVsMock.mockClear();
    defaultEgressMocks.applySeMock.mockClear();
    mockPurgeOrphans.mockClear();

    // mock the old egress allow rule was removed from the package
    await reconcileSharedEgressResources(undefined, packageIdMock, PackageAction.AddOrUpdate);

    // no new calls after old allow was removed
    expect(defaultEgressMocks.applyGwMock).not.toHaveBeenCalled();
    expect(defaultEgressMocks.applyVsMock).not.toHaveBeenCalled();
    expect(defaultEgressMocks.applySeMock).not.toHaveBeenCalled();

    // existing resources were purged
    expect(mockPurgeOrphans).toHaveBeenCalledTimes(3);

    // Check the value of inMemoryPackageMap
    expect(inMemoryPackageMap).toEqual({});
  });

  it("should remove old egress resources on action Remove", async () => {
    updateEgressMocks(defaultEgressMocks);

    await reconcileSharedEgressResources(
      hostResourceMapMock,
      packageIdMock,
      PackageAction.AddOrUpdate,
    );

    expect(defaultEgressMocks.applyGwMock).toHaveBeenCalledTimes(1);
    expect(defaultEgressMocks.applyVsMock).toHaveBeenCalledTimes(1);
    expect(defaultEgressMocks.applySeMock).toHaveBeenCalledTimes(1);

    mockPurgeOrphans.mockClear();

    // Mock removal of the package
    await reconcileSharedEgressResources(undefined, packageIdMock, PackageAction.Remove);

    // Check the value of inMemoryPackageMap
    expect(inMemoryPackageMap).toEqual({});

    // Check purge methods are called (Gateway, VirtualService, ServiceEntry)
    expect(mockPurgeOrphans).toHaveBeenCalledTimes(3);
  });

  it("should not delete egress resources if egress namespace is not found on action Remove", async () => {
    const errorMessage = "Namespace not found";
    const getNsMock = vi.fn<() => Promise<kind.Namespace>>().mockRejectedValue({
      message: errorMessage,
      status: 404,
    });

    updateEgressMocks({
      ...defaultEgressMocks,
      getNsMock,
    });

    // Mock removal of the package
    await reconcileSharedEgressResources(undefined, packageIdMock, PackageAction.Remove);

    // Should not call purge
    expect(mockPurgeOrphans).not.toHaveBeenCalled();
  });

  it("should handle reconciliation errors gracefully", async () => {
    const hostResourceMapMock: HostResourceMap = {
      "example.com": {
        portProtocol: [{ port: 443, protocol: RemoteProtocol.TLS }],
      },
    };

    const errorMessage = "Reconciliation failed";
    const getNsMock = vi
      .fn<() => Promise<kind.Namespace>>()
      .mockRejectedValue(new Error(errorMessage));

    updateEgressMocks({
      ...defaultEgressMocks,
      getNsMock,
    });

    await expect(
      reconcileSharedEgressResources(
        hostResourceMapMock,
        "test-package",
        PackageAction.AddOrUpdate,
      ),
    ).rejects.toThrow(errorMessage);
  });

  it("should handle undefined hostResourceMap with AddOrUpdate action", async () => {
    updateEgressMocks(defaultEgressMocks);

    // This should not throw and should result in removal
    await expect(
      reconcileSharedEgressResources(undefined, "test-package", PackageAction.AddOrUpdate),
    ).resolves.not.toThrow();

    expect(inMemoryPackageMap).toEqual({});
  });
});

describe("test performEgressReconciliationWithMutex", () => {
  beforeEach(() => {
    process.env.PEPR_WATCH_MODE = "true";
    vi.useFakeTimers();
    vi.clearAllMocks();
    // Reset the map before each test
    for (const key in inMemoryPackageMap) {
      delete inMemoryPackageMap[key];
    }
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it("should successfully perform reconciliation when no mutex is held", async () => {
    updateEgressMocks(defaultEgressMocks);

    await expect(performEgressReconciliationWithMutex("test-package")).resolves.not.toThrow();

    // Should have called the namespace check
    expect(defaultEgressMocks.getNsMock).toHaveBeenCalled();
  });

  it("should handle reconciliation failure and re-throw error", async () => {
    const errorMessage = "Reconciliation failed";
    const error = Object.assign(new Error(errorMessage), { status: 500 });

    const getNsMock = vi.fn<() => Promise<kind.Namespace>>().mockRejectedValue(error);

    updateEgressMocks({
      ...defaultEgressMocks,
      getNsMock,
    });

    await expect(performEgressReconciliationWithMutex("test-package")).rejects.toThrow(
      errorMessage,
    );
  });

  it("should wait for existing reconciliation to complete", async () => {
    updateEgressMocks(defaultEgressMocks);

    // Start first reconciliation (this will hold the mutex)
    const firstReconciliation = performEgressReconciliationWithMutex("test-package-1");

    // Start second reconciliation while first is in progress
    const secondReconciliation = performEgressReconciliationWithMutex("test-package-2");

    // Check both can reconcile without error
    await expect(Promise.all([firstReconciliation, secondReconciliation])).resolves.not.toThrow();

    // The namespace check will be called at least once
    expect(defaultEgressMocks.getNsMock).toHaveBeenCalled();
  });

  it("should handle previous reconciliation failure and start new one", async () => {
    // First reconciliation will fail
    const errorMessage = "First reconciliation failed";
    const error = Object.assign(new Error(errorMessage), { status: 500 });

    let callCount = 0;
    const getNsMock = vi.fn<() => Promise<kind.Namespace>>().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.reject(error);
      }
      return Promise.resolve({} as kind.Namespace);
    });

    updateEgressMocks({
      ...defaultEgressMocks,
      getNsMock,
    });

    // First reconciliation should fail
    await expect(performEgressReconciliationWithMutex("test-package")).rejects.toThrow(
      errorMessage,
    );

    // Second reconciliation should succeed despite the previous failure
    await expect(performEgressReconciliationWithMutex("test-package")).resolves.not.toThrow();

    // Should have been called twice
    expect(getNsMock).toHaveBeenCalledTimes(2);
  });

  it("should handle namespace 404 gracefully", async () => {
    const getNsMock = vi.fn<() => Promise<kind.Namespace>>().mockRejectedValue({
      status: 404,
      message: "Namespace not found",
    });

    updateEgressMocks({
      ...defaultEgressMocks,
      getNsMock,
    });

    // Should not throw for 404 (early return)
    await expect(performEgressReconciliationWithMutex("test-package")).resolves.not.toThrow();

    expect(getNsMock).toHaveBeenCalled();
  });
});

describe("test performEgressReconciliation", () => {
  beforeEach(() => {
    process.env.PEPR_WATCH_MODE = "true";
    vi.useFakeTimers();
    vi.clearAllMocks();
    // Reset the map before each test
    for (const key in inMemoryPackageMap) {
      delete inMemoryPackageMap[key];
    }
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it("should skip reconciliation when namespace is not found (404)", async () => {
    const getNsMock = vi.fn<() => Promise<kind.Namespace>>().mockRejectedValue({
      status: 404,
      message: "Namespace not found",
    });

    updateEgressMocks({
      ...defaultEgressMocks,
      getNsMock,
    });

    // Should not throw and should return early
    await expect(performEgressReconciliation()).resolves.not.toThrow();

    // Should not call apply methods since it returns early
    expect(defaultEgressMocks.applyGwMock).not.toHaveBeenCalled();
    expect(defaultEgressMocks.applyVsMock).not.toHaveBeenCalled();
    expect(defaultEgressMocks.applySeMock).not.toHaveBeenCalled();
  });

  it("should throw error for namespace errors other than 404", async () => {
    const errorMessage = "Internal server error";
    const error = Object.assign(new Error(errorMessage), { status: 500 });

    const getNsMock = vi.fn<() => Promise<kind.Namespace>>().mockRejectedValue(error);

    updateEgressMocks({
      ...defaultEgressMocks,
      getNsMock,
    });

    await expect(performEgressReconciliation()).rejects.toThrow(errorMessage);
  });

  it("should successfully reconcile when namespace exists", async () => {
    // Add some test data to inMemoryPackageMap
    inMemoryPackageMap["test-package"] = {
      "example.com": {
        portProtocol: [{ port: 443, protocol: RemoteProtocol.TLS }],
      },
    };

    updateEgressMocks(defaultEgressMocks);

    await expect(performEgressReconciliation()).resolves.not.toThrow();

    // Should call apply methods for the resources
    expect(defaultEgressMocks.applyGwMock).toHaveBeenCalled();
    expect(defaultEgressMocks.applyVsMock).toHaveBeenCalled();
    expect(defaultEgressMocks.applySeMock).toHaveBeenCalled();
  });

  it("should handle applyEgressResources failure", async () => {
    // Add some test data to inMemoryPackageMap
    inMemoryPackageMap["test-package"] = {
      "example.com": {
        portProtocol: [{ port: 443, protocol: RemoteProtocol.TLS }],
      },
    };

    const errorMessage = "Apply resources failed";
    updateEgressMocks({
      ...defaultEgressMocks,
      applyGwMock: vi.fn<() => Promise<void>>().mockRejectedValue(new Error(errorMessage)),
    });

    await expect(performEgressReconciliation()).rejects.toThrow(
      "Failed to apply Gateway for host example.com",
    );
  });

  it("should handle empty inMemoryPackageMap", async () => {
    updateEgressMocks(defaultEgressMocks);

    await expect(performEgressReconciliation()).resolves.not.toThrow();

    // Should not call apply methods for empty map
    expect(defaultEgressMocks.applyGwMock).not.toHaveBeenCalled();
    expect(defaultEgressMocks.applyVsMock).not.toHaveBeenCalled();
    expect(defaultEgressMocks.applySeMock).not.toHaveBeenCalled();
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
    const hostResourceMap: HostResourceMap = {
      "example.com": {
        portProtocol: [{ port: 443, protocol: RemoteProtocol.TLS }],
      },
    };

    // This test verifies the normal update mechanism works correctly
    await expect(
      updateInMemoryPackageMap(hostResourceMap, "package1", PackageAction.AddOrUpdate),
    ).resolves.not.toThrow();

    expect(inMemoryPackageMap["package1"]).toEqual(hostResourceMap);
  });

  test("should resolve concurrent updates correctly", async () => {
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

    // // Create an array of promises for each update
    // const promises = mockUpdates.map(
    //   ({ pkgId, hostResourceMap, action }) =>
    //     new Promise<void>(resolve => {
    //       setTimeout(() => {
    //         updateInMemoryPackageMap(hostResourceMap, pkgId, action);
    //         resolve();
    //       }, 0);
    //     }),
    // );

    // Wait for all updates to complete
    await Promise.all(promises);

    // Validate inMemoryPackageMap
    expect(inMemoryPackageMap).toEqual({
      "test-package-test-namespace1": hostResourceMapMockTls,
      "test-package-test-namespace2": hostResourceMapMockHttp,
      "test-package-test-namespace3": hostResourceMapMockTls,
      "test-package-test-namespace4": hostResourceMapMockHttp,
    });

    // Check that the lock was set and released
    expect(log.debug).toHaveBeenCalledWith(
      expect.stringContaining("Locking egress package map for update"),
    );
    expect(log.debug).toHaveBeenCalledWith(
      expect.stringContaining("Unlocking egress package map for update"),
    );
    expect(log.error).not.toHaveBeenCalled();
  });

  test("should reject conflicting protocols during update", async () => {
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

  test("should allow updating same package with different protocol", async () => {
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

  it("should handle Remove action correctly", async () => {
    const hostResourceMap: HostResourceMap = {
      "example.com": {
        portProtocol: [{ port: 443, protocol: RemoteProtocol.TLS }],
      },
    };

    // First add a package
    await updateInMemoryPackageMap(hostResourceMap, "package1", PackageAction.AddOrUpdate);
    expect(inMemoryPackageMap["package1"]).toEqual(hostResourceMap);

    // Then remove it
    await updateInMemoryPackageMap(undefined, "package1", PackageAction.Remove);
    expect(inMemoryPackageMap).not.toHaveProperty("package1");
  });
});

describe("test applyEgressResources", () => {
  const pkgHostMapMock: PackageHostMap = {
    package1: {
      "example.com": {
        portProtocol: [{ port: 443, protocol: RemoteProtocol.TLS }],
      },
    },
  };

  beforeEach(() => {
    process.env.PEPR_WATCH_MODE = "true";
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("should apply egress resources", async () => {
    updateEgressMocks(defaultEgressMocks);

    await applyEgressResources(pkgHostMapMock, 1);

    expect(defaultEgressMocks.getGwMock).toHaveBeenCalledTimes(1);
    expect(defaultEgressMocks.getVsMock).toHaveBeenCalledTimes(1);
    expect(defaultEgressMocks.applyGwMock).toHaveBeenCalledTimes(1);
    expect(defaultEgressMocks.applyVsMock).toHaveBeenCalledTimes(1);
    expect(defaultEgressMocks.applySeMock).toHaveBeenCalledTimes(1);
  });

  it("should apply multiple shared egress resources - multiple defined hosts", async () => {
    const pkgHostMap = {
      package1: {
        "example.com": {
          portProtocol: [{ port: 443, protocol: RemoteProtocol.TLS }],
        },
        "httpbin.org": {
          portProtocol: [{ port: 80, protocol: RemoteProtocol.HTTP }],
        },
      },
    };

    updateEgressMocks(defaultEgressMocks);

    await applyEgressResources(pkgHostMap, 1);

    expect(defaultEgressMocks.getGwMock).toHaveBeenCalledTimes(2);
    expect(defaultEgressMocks.getVsMock).toHaveBeenCalledTimes(2);
    expect(defaultEgressMocks.applyGwMock).toHaveBeenCalledTimes(2);
    expect(defaultEgressMocks.applyVsMock).toHaveBeenCalledTimes(2);
    expect(defaultEgressMocks.applySeMock).toHaveBeenCalledTimes(2);
  });

  it("should apply shared egress resources once - one host", async () => {
    const pkg2HostMap = {
      package2: {
        "example.com": {
          portProtocol: [{ port: 80, protocol: RemoteProtocol.HTTP }],
        },
      },
    };

    updateEgressMocks(defaultEgressMocks);

    await applyEgressResources({ ...pkgHostMapMock, ...pkg2HostMap }, 1);

    expect(defaultEgressMocks.getGwMock).toHaveBeenCalledTimes(1);
    expect(defaultEgressMocks.getVsMock).toHaveBeenCalledTimes(1);
    expect(defaultEgressMocks.applyGwMock).toHaveBeenCalledTimes(1);
    expect(defaultEgressMocks.applyVsMock).toHaveBeenCalledTimes(1);
    expect(defaultEgressMocks.applySeMock).toHaveBeenCalledTimes(1);
  });

  it("should handle Gateway application error", async () => {
    const errorMessage = "K8s API error";

    updateEgressMocks({
      ...defaultEgressMocks,
      applyGwMock: vi
        .fn<() => Promise<void>>()
        .mockImplementationOnce(() => Promise.reject(new Error(errorMessage))),
    });

    await expect(applyEgressResources(pkgHostMapMock, 1)).rejects.toThrow(
      "Failed to apply Gateway for host example.com",
    );
  });

  it("should handle Virtual Service application error", async () => {
    const pkgHostMapMock: PackageHostMap = {
      package1: {
        "example.com": {
          portProtocol: [{ port: 443, protocol: RemoteProtocol.TLS }],
        },
      },
    };

    const errorMessage = "Virtual Service error";

    updateEgressMocks({
      ...defaultEgressMocks,
      applyVsMock: vi
        .fn<() => Promise<void>>()
        .mockImplementationOnce(() => Promise.reject(new Error(errorMessage))),
    });

    await expect(applyEgressResources(pkgHostMapMock, 1)).rejects.toThrow(
      "Failed to apply Virtual Service for host example.com",
    );
  });

  it("should handle Service Entry application error", async () => {
    const pkgHostMapMock: PackageHostMap = {
      package1: {
        "example.com": {
          portProtocol: [{ port: 443, protocol: RemoteProtocol.TLS }],
        },
      },
    };

    const errorMessage = "Service Entry error";

    updateEgressMocks({
      ...defaultEgressMocks,
      applySeMock: vi
        .fn<() => Promise<void>>()
        .mockImplementationOnce(() => Promise.reject(new Error(errorMessage))),
    });

    await expect(applyEgressResources(pkgHostMapMock, 1)).rejects.toThrow(
      "Failed to apply Service Entry for host example.com",
    );
  });

  it("should not apply egress resources when conflicting host is found", async () => {
    const gwName = "sample-gateway";
    const gwNamespace = "sample-ns";

    const getGwMock = vi.fn<() => Promise<{ items: IstioGateway[] }>>().mockResolvedValueOnce({
      items: [
        {
          metadata: {
            name: gwName,
            namespace: gwNamespace,
          },
          spec: {
            selector: {
              istio: "egressgateway",
            },
            servers: [
              {
                hosts: ["example.com"],
                port: {
                  number: 443,
                  name: "tls-443",
                  protocol: "TLS",
                },
              },
            ],
          },
        },
      ],
    });

    updateEgressMocks({
      ...defaultEgressMocks,
      getGwMock,
    });

    const expectedErrorMessage = `Found existing Gateway ${gwName}/${gwNamespace} with matching host. Istio will not behave properly with multiple Gateways using the same hosts.`;

    await expect(applyEgressResources(pkgHostMapMock, 1)).rejects.toThrow(expectedErrorMessage);
  });

  it("should apply egress resources when non-conflicting host is found", async () => {
    const gwName = "sample-gateway";
    const gwNamespace = "sample-ns";

    const getGwMock = vi.fn<() => Promise<{ items: IstioGateway[] }>>().mockResolvedValue({
      items: [
        {
          metadata: {
            name: gwName,
            namespace: gwNamespace,
          },
          spec: {
            selector: {
              istio: "egressgateway",
            },
            servers: [
              {
                hosts: ["google.com"],
                port: {
                  number: 443,
                  name: "tls-443",
                  protocol: "TLS",
                },
              },
            ],
          },
        },
      ],
    });

    updateEgressMocks({
      ...defaultEgressMocks,
      getGwMock,
    });

    await applyEgressResources(pkgHostMapMock, 1);

    expect(defaultEgressMocks.applyGwMock).toHaveBeenCalledTimes(1);
    expect(defaultEgressMocks.applyVsMock).toHaveBeenCalledTimes(1);
    expect(defaultEgressMocks.applySeMock).toHaveBeenCalledTimes(1);
  });

  it("should handle empty package host map", async () => {
    updateEgressMocks(defaultEgressMocks);

    await expect(applyEgressResources({}, 1)).resolves.not.toThrow();

    // No resources should be applied for empty map
    expect(defaultEgressMocks.applyGwMock).not.toHaveBeenCalled();
    expect(defaultEgressMocks.applyVsMock).not.toHaveBeenCalled();
    expect(defaultEgressMocks.applySeMock).not.toHaveBeenCalled();
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
        RemoteGenerated: RemoteGenerated.Anywhere,
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

  it("should handle empty package spec", () => {
    const hostResourceMap = createHostResourceMap(pkgMock);
    expect(hostResourceMap).toBeUndefined();
  });
});

describe("test remapEgressResources", () => {
  it("should remap egress resources from package host map", () => {
    const packageEgress = {
      package1: {
        "example.com": {
          portProtocol: [
            { port: 443, protocol: RemoteProtocol.TLS },
            { port: 80, protocol: RemoteProtocol.HTTP },
          ],
        },
      },
      package2: {
        "example.com": {
          portProtocol: [{ port: 80, protocol: RemoteProtocol.HTTP }],
        },
      },
    };

    const egressResources = remapEgressResources(packageEgress);

    expect(egressResources).toEqual({
      "example.com": {
        packages: ["package1", "package2"],
        portProtocols: [
          { port: 443, protocol: RemoteProtocol.TLS },
          { port: 80, protocol: RemoteProtocol.HTTP },
        ],
      },
    });
  });

  it("should handle empty package host map", () => {
    const packageEgress = {};
    const egressResources = remapEgressResources(packageEgress);
    expect(egressResources).toEqual({});
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

describe("test validateEgressGateway", () => {
  beforeEach(() => {
    process.env.PEPR_WATCH_MODE = "true";
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("should err if get egress gateway namespace fails", async () => {
    const errorMessage =
      "Unable to reconcile get the egress gateway namespace istio-egress-gateway.";

    const getNsMock = vi
      .fn<() => Promise<kind.Namespace>>()
      .mockRejectedValue(new Error(errorMessage));

    updateEgressMocks({
      ...defaultEgressMocks,
      getNsMock,
    });

    await expect(validateEgressGateway({})).rejects.toThrow(errorMessage);
  });

  it("should err if no egress gateway port", async () => {
    const mockError = new Error(
      "Egress gateway does not expose port 1234 for host example.com. Please update the egress gateway service to expose this port.",
    );

    const mockHostResourceMap = {
      "example.com": {
        portProtocol: [{ port: 1234, protocol: RemoteProtocol.TLS }],
      },
    };

    updateEgressMocks(defaultEgressMocks);

    await expect(validateEgressGateway(mockHostResourceMap)).rejects.toThrowError(mockError);
  });

  it("should handle multiple hosts and ports validation", async () => {
    updateEgressMocks(defaultEgressMocks);

    const mockHostResourceMap = {
      "example.com": {
        portProtocol: [
          { port: 443, protocol: RemoteProtocol.TLS },
          { port: 80, protocol: RemoteProtocol.HTTP },
        ],
      },
      "another.com": {
        portProtocol: [{ port: 8080, protocol: RemoteProtocol.HTTP }],
      },
    };

    // Should fail because 8080 is not in the default service mock
    await expect(validateEgressGateway(mockHostResourceMap)).rejects.toThrow(
      "Egress gateway does not expose port 8080 for host another.com",
    );
  });

  it("should pass if namespace is not found and service is good", async () => {
    const mockHostResourceMap = {
      "example.com": {
        portProtocol: [{ port: 443, protocol: RemoteProtocol.TLS }],
      },
    };

    updateEgressMocks(defaultEgressMocks);

    await expect(validateEgressGateway(mockHostResourceMap)).resolves.not.toThrow();
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

describe("test removeEgressResources", () => {
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
    removeEgressResources("test-package");

    // Verify it's removed
    expect(inMemoryPackageMap).not.toHaveProperty("test-package");
    expect(inMemoryPackageMap).toEqual({});
  });

  it("should handle removal of non-existent package gracefully", () => {
    // Try to remove a package that doesn't exist
    removeEgressResources("non-existent-package");

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
    removeEgressResources("package1");

    // Verify only the specified package is removed
    expect(inMemoryPackageMap).not.toHaveProperty("package1");
    expect(inMemoryPackageMap).toHaveProperty("package2");
    expect(inMemoryPackageMap["package2"]).toEqual(hostResourceMap2);
  });
});
