/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { kind } from "pepr";
import { afterEach, beforeEach, describe, expect, it, Mock, MockedFunction, vi } from "vitest";
import { Direction, IstioGateway, RemoteProtocol } from "../../crd/index.js";
import { purgeOrphans } from "../utils.js";
import { defaultEgressMocks, updateEgressMocks } from "./defaultTestMocks.js";
import { PackageHostMap } from "./types.js";

import {
  applySidecarEgressResources,
  createSidecarWorkloadEgressResources,
  purgeSidecarEgressResources,
  remapEgressResources,
  validateEgressGateway,
} from "./egress-sidecar.js";

// Mock purge orphans
const mockPurgeOrphans: MockedFunction<() => Promise<void>> = vi.fn();
vi.mock("../utils", async () => {
  const originalModule = (await vi.importActual("../utils")) as object;
  return {
    ...originalModule,
    purgeOrphans: vi.fn(async <T>(fn: () => Promise<T>) => fn()),
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

describe("test applySidecarEgressResources", () => {
  const pkgHostMapMock: PackageHostMap = {
    package1: {
      "example.com": {
        portProtocol: [{ port: 443, protocol: RemoteProtocol.TLS }],
      },
    },
  };

  beforeEach(async () => {
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

    await applySidecarEgressResources(pkgHostMapMock, 1);

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

    await applySidecarEgressResources(pkgHostMap, 1);

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

    await applySidecarEgressResources({ ...pkgHostMapMock, ...pkg2HostMap }, 1);

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

    await expect(applySidecarEgressResources(pkgHostMapMock, 1)).rejects.toThrow(
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

    await expect(applySidecarEgressResources(pkgHostMapMock, 1)).rejects.toThrow(
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

    await expect(applySidecarEgressResources(pkgHostMapMock, 1)).rejects.toThrow(
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

    await expect(applySidecarEgressResources(pkgHostMapMock, 1)).rejects.toThrow(
      expectedErrorMessage,
    );
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

    await applySidecarEgressResources(pkgHostMapMock, 1);

    expect(defaultEgressMocks.applyGwMock).toHaveBeenCalledTimes(1);
    expect(defaultEgressMocks.applyVsMock).toHaveBeenCalledTimes(1);
    expect(defaultEgressMocks.applySeMock).toHaveBeenCalledTimes(1);
  });

  it("should handle empty package host map", async () => {
    updateEgressMocks(defaultEgressMocks);

    await expect(applySidecarEgressResources({}, 1)).resolves.not.toThrow();

    // No resources should be applied for empty map
    expect(defaultEgressMocks.applyGwMock).not.toHaveBeenCalled();
    expect(defaultEgressMocks.applyVsMock).not.toHaveBeenCalled();
    expect(defaultEgressMocks.applySeMock).not.toHaveBeenCalled();
  });
});

describe("test purgeSidecarEgressResources", () => {
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

    await purgeSidecarEgressResources("1");

    expect(mockPurgeOrphans).toHaveBeenCalledTimes(3);
  });

  it("should handle purge error", async () => {
    const errorMessage = "Purge error";

    mockPurgeOrphans.mockRejectedValueOnce(new Error(errorMessage));

    await expect(purgeSidecarEgressResources("1")).rejects.toThrow(
      "Failed to purge orphaned sidecar egress resources",
    );
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
    const errorMessage = "Unable to get the egress gateway namespace istio-egress-gateway.";

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

  it("should pass if namespace is found and service is good", async () => {
    const mockHostResourceMap = {
      "example.com": {
        portProtocol: [{ port: 443, protocol: RemoteProtocol.TLS }],
      },
    };

    updateEgressMocks(defaultEgressMocks);

    await expect(validateEgressGateway(mockHostResourceMap)).resolves.not.toThrow();
  });
});

describe("test createSidecarWorkloadEgressResources", () => {
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

  it("should create sidecar egress resources", async () => {
    updateEgressMocks(defaultEgressMocks);

    await createSidecarWorkloadEgressResources(
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
    expect(defaultEgressMocks.applySidecarMock).toHaveBeenCalledTimes(1);
  });

  it("should create sidecar egress resources for multiple hosts", async () => {
    updateEgressMocks(defaultEgressMocks);

    await createSidecarWorkloadEgressResources(
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
          selector: { app: "my-app" },
        },
        {
          direction: Direction.Egress,
          remoteHost: "httpbin.org",
          remoteProtocol: RemoteProtocol.TLS,
          port: 443,
          selector: { app: "my-app" },
        },
      ],
      "test-package",
      "test-ns",
      "1",
      [],
    );

    expect(defaultEgressMocks.applySeMock).toHaveBeenCalledTimes(2);
    // Should only apply sidecar once since the selector is the same
    expect(defaultEgressMocks.applySidecarMock).toHaveBeenCalledTimes(1);
  });

  it("should create sidecar egress resources for correct workloads", async () => {
    updateEgressMocks(defaultEgressMocks);

    await createSidecarWorkloadEgressResources(
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
          selector: { app: "my-app" },
        },
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
    // Should only apply sidecar twice, one for defined, another for undefined
    expect(defaultEgressMocks.applySidecarMock).toHaveBeenCalledTimes(2);
  });
});
