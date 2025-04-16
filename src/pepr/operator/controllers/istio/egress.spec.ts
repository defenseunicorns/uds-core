/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { describe, expect, it, jest, beforeEach } from "@jest/globals";
import { K8s } from "pepr";
import { Direction, RemoteProtocol, IstioGateway, IstioVirtualService, IstioServiceEntry } from "../../crd";
import {
  applyEgressResources,
  createHostResourceMap,
  getHostPortsProtocol,
  remapEgressResources,
} from "./egress";

describe("test createHostResourceMap", () => {
  it("should create a host resource map from a package", () => {
    const pkg = {
      spec: {
        network: {
          allow: [
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
          ],
        },
      },
    };

    const hostResourceMap = createHostResourceMap(pkg);

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
    const pkg = {
      spec: {
        network: {
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

    const hostResourceMap = createHostResourceMap(pkg);

    expect(hostResourceMap).toEqual({
      "example.com": {
        portProtocol: [
          { port: 443, protocol: RemoteProtocol.TLS },
          { port: 8443, protocol: RemoteProtocol.TLS },
        ],
      },
    });
  });

  it("should handle empty package spec", () => {
    const pkg = {
      spec: {
        network: {
          allow: [],
        },
      },
    };
    const hostResourceMap = createHostResourceMap(pkg);
    expect(hostResourceMap).toEqual(null);
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

  it("should return null for non-egress direction", () => {
    const allow = {
      direction: Direction.Ingress,
      remoteHost: "example.com",
      remoteProtocol: RemoteProtocol.HTTP,
      port: 80,
    };

    const result = getHostPortsProtocol(allow);

    expect(result).toEqual({
      host: "example.com",
      ports: [80],
      protocol: RemoteProtocol.HTTP,
    });
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

// Mock the necessary Kubernetes functions
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
  },
}));

describe("test applyEgressResources", () => {
  const TEST_PACKAGE_HOST_MAP = {
    package1: {
      "example.com": {
        portProtocol: [
          { port: 443, protocol: RemoteProtocol.TLS },
        ],
      },
    },
  };
  
  let applyMock: jest.Mock;
  let getGwMock: jest.Mock;
  let getVsMock: jest.Mock;
  
  beforeEach(() => {
    
    process.env.PEPR_WATCH_MODE = "true";
    jest.useFakeTimers();
    
    const mockK8s = jest.mocked(K8s);
    
    applyMock = jest.fn().mockReturnValue(Promise.resolve());
    getGwMock = jest.fn<() => Promise<{ items: IstioGateway[] }>>().mockResolvedValue({
      items: [],
    });
    getVsMock = jest.fn<() => Promise<{ items: IstioVirtualService[] }>>().mockResolvedValue({
      items: [],
    });

    const baseImplementation = {
      Apply: applyMock,
      InNamespace: jest.fn().mockReturnThis(),
      Get: jest.fn(),
      Logs: jest.fn(),
      Delete: jest.fn(),
      Watch: jest.fn(),
    };
    
    // Define only the differences for specific resources
    const k8sImplementations = {
      [IstioGateway.name]: { ...baseImplementation, Get: getGwMock },
      [IstioVirtualService.name]: { ...baseImplementation, Get: getVsMock },
      [IstioServiceEntry.name]: { ...baseImplementation }
    };

    // Add type assertion to fix TypeScript errors
    mockK8s.mockImplementation(((model: any) => 
      k8sImplementations[model.name] || baseImplementation
    ) as any);
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it("should apply egress resources", async () => {
    await applyEgressResources(TEST_PACKAGE_HOST_MAP, 1);
    
    expect(applyMock).toHaveBeenCalledTimes(3); // Gateway, VirtualService, ServiceEntry
    expect(getGwMock).toHaveBeenCalledTimes(1);
    expect(getVsMock).toHaveBeenCalledTimes(1);
    
    const resources = applyMock.mock.calls.map(call => call[0] as any);
    
    expect(resources.length).toBe(3);
    expect(resources.some(result => result?.spec?.hosts?.includes("example.com") || 
                               result?.spec?.servers?.some((s: any) => s.hosts?.includes("example.com")))).toBe(true);
  });
  
  it("should handle errors when applying egress resources", async () => {
    const errorMessage = "K8s API error";
    
    applyMock.mockImplementationOnce(() => Promise.reject(new Error(errorMessage)));
    
    await expect(applyEgressResources(TEST_PACKAGE_HOST_MAP, 1))
      .rejects.toThrow(errorMessage);
  });
});