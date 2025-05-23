/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { kind } from "pepr";
import { Direction, IstioGateway, RemoteProtocol, RemoteGenerated } from "../../crd";
import { defaultEgressMocks, pkgMock, updateEgressMocks } from "./defaultTestMocks";
import {
  applyEgressResources,
  createHostResourceMap,
  egressRequestedFromNetwork,
  getHostPortsProtocol,
  reconcileSharedEgressResources,
  remapEgressResources,
  updateInMemoryPackageMap,
  inMemoryPackageMap,
  validateEgressGateway,
} from "./egress";
import { PackageAction, HostResourceMap, PackageHostMap } from "./types";
import { purgeOrphans } from "../utils";

jest.mock("./istio-resources", () => {
  const originalModule = jest.requireActual("./istio-resources");
  return {
    ...(typeof originalModule === "object" ? originalModule : {}),
    log: {
      debug: jest.fn(),
      error: jest.fn(),
    },
  };
});

import { log } from "./istio-resources";

const mockPurgeOrphans: jest.MockedFunction<() => Promise<void>> = jest.fn();

// Mock the necessary functions
jest.mock("pepr", () => ({
  K8s: jest.fn(),
  Log: {
    child: jest.fn(() => ({
      info: jest.fn(),
      debug: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
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
jest.mock("../utils", () => {
  const originalModule = jest.requireActual("../utils");
  return {
    ...(typeof originalModule === "object" ? originalModule : {}),
    purgeOrphans: jest.fn(async <T>(fn: () => Promise<T>) => fn()),
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
    jest.useFakeTimers();

    (purgeOrphans as jest.Mock).mockImplementation(mockPurgeOrphans);
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  // Helper function to run reconcileSharedEgressResources with timer handling
  async function runReconcileWithTimers(
    hostResourceMap: HostResourceMap | undefined,
    pkgId: string,
    action: PackageAction,
  ) {
    const promise = reconcileSharedEgressResources(hostResourceMap, pkgId, action);
    jest.advanceTimersByTime(1100); // fast-forward timer to trigger debounced functions
    await promise;
  }

  it("should create egress resources on action AddOrUpdate", async () => {
    updateEgressMocks(defaultEgressMocks);

    await runReconcileWithTimers(hostResourceMapMock, packageIdMock, PackageAction.AddOrUpdate);

    // Check apply methods are called
    expect(defaultEgressMocks.applyGwMock).toHaveBeenCalledTimes(1);
    expect(defaultEgressMocks.applyVsMock).toHaveBeenCalledTimes(1);
    expect(defaultEgressMocks.applySeMock).toHaveBeenCalledTimes(1);

    // Validate inMemoryPackageMap
    expect(inMemoryPackageMap).toEqual({ "test-package-test-namespace": hostResourceMapMock });
  });

  it("should apply an updated set of egress resources on action AddOrUpdate", async () => {
    updateEgressMocks(defaultEgressMocks);

    await runReconcileWithTimers(hostResourceMapMock, packageIdMock, PackageAction.AddOrUpdate);

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

    await runReconcileWithTimers(
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

    await runReconcileWithTimers(hostResourceMapMock, packageIdMock, PackageAction.AddOrUpdate);

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
    await runReconcileWithTimers(undefined, packageIdMock, PackageAction.AddOrUpdate);

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

    await runReconcileWithTimers(hostResourceMapMock, packageIdMock, PackageAction.AddOrUpdate);

    expect(defaultEgressMocks.applyGwMock).toHaveBeenCalledTimes(1);
    expect(defaultEgressMocks.applyVsMock).toHaveBeenCalledTimes(1);
    expect(defaultEgressMocks.applySeMock).toHaveBeenCalledTimes(1);

    mockPurgeOrphans.mockClear();

    // Mock removal of the package
    await runReconcileWithTimers(undefined, packageIdMock, PackageAction.Remove);

    // Check the value of inMemoryPackageMap
    expect(inMemoryPackageMap).toEqual({});

    // Check purge methods are called (Gateway, VirtualService, ServiceEntry)
    expect(mockPurgeOrphans).toHaveBeenCalledTimes(3);
  });

  it("should not delete egress resources if egress namespace is not found", async () => {
    const errorMessage = "Namespace not found";
    const getNsMock = jest.fn<() => Promise<kind.Namespace>>().mockRejectedValue({
      message: errorMessage,
      status: 404,
    });

    updateEgressMocks({
      ...defaultEgressMocks,
      getNsMock,
    });

    // Mock removal of the package
    await runReconcileWithTimers(undefined, packageIdMock, PackageAction.Remove);

    // Should not call purge
    expect(mockPurgeOrphans).not.toHaveBeenCalled();
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
    jest.clearAllMocks();
    // Reset the map before each test
    for (const key in inMemoryPackageMap) {
      delete inMemoryPackageMap[key];
    }
  });

  test("concurrent updates should resolve correctly", async () => {
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
        new Promise<void>(resolve => {
          setTimeout(() => {
            updateInMemoryPackageMap(hostResourceMap, pkgId, action);
            resolve();
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

    // Check that the lock was set and released
    expect(log.debug).toHaveBeenCalledWith(
      expect.stringContaining("Locking egress package map for update"),
    );
    expect(log.debug).toHaveBeenCalledWith(
      expect.stringContaining("Unlocking egress package map for update"),
    );
    expect(log.error).not.toHaveBeenCalled();
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
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    jest.clearAllMocks();
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

  it("should handle errors when applying egress resources", async () => {
    const errorMessage = "K8s API error";

    updateEgressMocks({
      ...defaultEgressMocks,
      applyGwMock: jest
        .fn<() => Promise<void>>()
        .mockImplementationOnce(() => Promise.reject(new Error(errorMessage))),
    });

    await expect(applyEgressResources(pkgHostMapMock, 1)).rejects.toThrow(errorMessage);
  });

  it("should not apply egress resources when conflicting host is found", async () => {
    const gwName = "sample-gateway";
    const gwNamespace = "sample-ns";

    const getGwMock = jest.fn<() => Promise<{ items: IstioGateway[] }>>().mockResolvedValueOnce({
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

    const getGwMock = jest.fn<() => Promise<{ items: IstioGateway[] }>>().mockResolvedValue({
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
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it("should err if no egress gateway namespace", async () => {
    const errorMessage = "Namespace not found";

    const getNsMock = jest
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

  it("should pass if namespace is not found and service is good", async () => {
    const mockHostResourceMap = {
      "example.com": {
        portProtocol: [{ port: 443, protocol: RemoteProtocol.TLS }],
      },
    };

    updateEgressMocks(defaultEgressMocks);

    await expect(validateEgressGateway(mockHostResourceMap)).resolves;
  });
});
