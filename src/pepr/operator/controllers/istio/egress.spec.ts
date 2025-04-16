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
  const applyMock = jest.fn();
  
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
    const packageHostMap = {
      package1: {
        "example.com": {
          portProtocol: [
            { port: 443, protocol: RemoteProtocol.TLS },
          ],
        },
      },
    };

    const getGwMock = jest.fn<() => Promise<{ items: IstioGateway[] }>>().mockResolvedValue({
      items: [],
    });

    const getVsMock = jest.fn<() => Promise<{ items: IstioVirtualService[] }>>().mockResolvedValue({
      items: [],
    });

    (K8s as jest.Mock).mockImplementation(kindType => {
      if (kindType === IstioGateway) {
        return {
          Get: getGwMock,
          Apply: applyMock,
        };
      } else if (kindType === IstioVirtualService) {
        return {
          Get: getVsMock,
          Apply: applyMock,
        };
      }
      else if (kindType === IstioServiceEntry) {
        return {
          Apply: applyMock,
        };
      }
      else {
        return {
          Get: jest.fn(),
          Apply: jest.fn(),
        };
      }
    });

    await applyEgressResources(packageHostMap, 1);
    expect(applyMock).toHaveBeenCalledTimes(3); // Gateway, VirtualService, ServiceEntry
    expect(getGwMock).toHaveBeenCalled();
    expect(getVsMock).toHaveBeenCalled();
  });
});