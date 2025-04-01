/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { describe, expect, it } from "@jest/globals";
import { createHostResourceMap, remapEgressResources } from "./egress";
import { Direction, RemoteProtocol } from "../../crd";

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
