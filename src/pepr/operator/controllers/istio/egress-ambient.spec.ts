/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { afterEach, beforeEach, describe, expect, it, Mock, MockedFunction, vi } from "vitest";
import { Allow, Direction, RemoteGenerated, RemoteProtocol, UDSPackage } from "../../crd";
import { Mode } from "../../crd/generated/package-v1alpha1";
import { purgeOrphans } from "../utils";
import { defaultEgressMocks, updateEgressMocks } from "./defaultTestMocks";
import { getAllowedPorts, getPortsForHostAllow } from "./egress-ports";

import { waitForWaypointPodHealthy } from "./ambient-waypoint";
import * as apMod from "./auth-policy";
import { applyAmbientEgressResources, purgeAmbientEgressResources } from "./egress-ambient";

import { AmbientPackageMap } from "./types";

import * as seMod from "./service-entry";

// Mock purge orphans
const mockPurgeOrphans: MockedFunction<() => Promise<void>> = vi.fn();
vi.mock("../utils", async () => {
  const originalModule = (await vi.importActual("../utils")) as object;
  return {
    ...originalModule,
    purgeOrphans: vi.fn().mockResolvedValue(undefined),
    retryWithDelay: vi.fn(async (fn: () => Promise<unknown>) => fn()),
  };
});

// Mock ambient-waypoint functions
vi.mock("./ambient-waypoint", async () => {
  const originalModule = (await vi.importActual("./ambient-waypoint")) as object;
  return {
    ...originalModule,
    waitForWaypointPodHealthy: vi.fn().mockResolvedValue(undefined),
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

describe("test applyAmbientEgressResources", () => {
  function buildAmbientMap(pkgs: UDSPackage[]): AmbientPackageMap {
    const map: AmbientPackageMap = {};
    for (const pkg of pkgs) {
      if (pkg.metadata?.deletionTimestamp) continue;
      const mode = pkg.spec?.network?.serviceMesh?.mode || Mode.Ambient;
      if (mode !== Mode.Ambient) continue;

      const name = pkg.metadata?.name;
      const namespace = pkg.metadata?.namespace;
      if (!name || !namespace) continue;

      const id = `${name}-${namespace}`;
      const rules = [] as AmbientPackageMap[string]["rules"];
      for (const allow of pkg.spec?.network?.allow ?? []) {
        if (allow.direction !== Direction.Egress) continue;

        if (allow.remoteGenerated === RemoteGenerated.Anywhere) {
          rules.push({
            kind: "anywhere",
            ports: getAllowedPorts(allow),
            serviceAccount: allow.serviceAccount,
          });
          continue;
        }

        if (allow.remoteHost) {
          const protocol = allow.remoteProtocol ?? RemoteProtocol.TLS;
          const ports = getPortsForHostAllow({
            ports: allow.ports,
            port: allow.port,
            remoteProtocol: protocol,
          });
          rules.push({
            kind: "host",
            host: allow.remoteHost,
            ports,
            protocol,
            serviceAccount: allow.serviceAccount,
          });
        }
      }
      map[id] = { name, namespace, rules };
    }
    return map;
  }

  beforeEach(async () => {
    process.env.PEPR_WATCH_MODE = "true";
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("should include Anywhere-only participant across all hosts", async () => {
    updateEgressMocks(defaultEgressMocks);

    const pkgItems: UDSPackage[] = [
      // Owner of example.com
      {
        apiVersion: "uds.dev/v1alpha1",
        kind: "Package",
        metadata: { name: "pkg1", namespace: "ns1" },
        spec: {
          network: {
            serviceMesh: { mode: Mode.Ambient },
            allow: [
              {
                direction: Direction.Egress,
                remoteHost: "example.com",
                port: 443,
                remoteProtocol: RemoteProtocol.TLS,
              } as Allow,
            ],
          },
        },
      },
      // Owner of api.github.com
      {
        apiVersion: "uds.dev/v1alpha1",
        kind: "Package",
        metadata: { name: "pkg2", namespace: "ns2" },
        spec: {
          network: {
            serviceMesh: { mode: Mode.Ambient },
            allow: [
              {
                direction: Direction.Egress,
                remoteHost: "api.github.com",
                port: 443,
                remoteProtocol: RemoteProtocol.TLS,
              } as Allow,
            ],
          },
        },
      },
      // Anywhere-only participant with SA
      {
        apiVersion: "uds.dev/v1alpha1",
        kind: "Package",
        metadata: { name: "pkg3", namespace: "ns3" },
        spec: {
          network: {
            serviceMesh: { mode: Mode.Ambient },
            allow: [
              {
                direction: Direction.Egress,
                remoteGenerated: RemoteGenerated.Anywhere,
                serviceAccount: "caller",
              } as Allow,
            ],
          },
        },
      },
    ];

    const apSpy = vi.spyOn(apMod, "generateCentralAmbientEgressAuthorizationPolicy");

    await applyAmbientEgressResources(buildAmbientMap(pkgItems), 3);

    // Called twice (once per host)
    expect(apSpy).toHaveBeenCalledTimes(2);
    // Both invocations include the Anywhere SA principal
    const calls = apSpy.mock.calls;
    for (const c of calls) {
      const identities = c[2];
      expect(identities.saPrincipals).toEqual(
        expect.arrayContaining(["cluster.local/ns/ns3/sa/caller"]),
      );
      expect(c[3]).toBeDefined();
      const byPort = c[4] as
        | Record<string, { saPrincipals: string[]; namespaces: string[] }>
        | undefined;
      expect(byPort).toBeDefined();
      expect(byPort).toHaveProperty("443");
      expect(byPort!["443"].saPrincipals).toEqual(
        expect.arrayContaining(["cluster.local/ns/ns3/sa/caller"]),
      );
    }

    apSpy.mockRestore();
  });

  it("should include port-scoped Anywhere participant only for the allowed port", async () => {
    updateEgressMocks(defaultEgressMocks);

    const pkgItems: UDSPackage[] = [
      {
        apiVersion: "uds.dev/v1alpha1",
        kind: "Package",
        metadata: { name: "pkg1", namespace: "ns1" },
        spec: {
          network: {
            serviceMesh: { mode: Mode.Ambient },
            allow: [
              {
                direction: Direction.Egress,
                remoteHost: "example.com",
                port: 80,
                remoteProtocol: RemoteProtocol.HTTP,
              } as Allow,
              {
                direction: Direction.Egress,
                remoteHost: "example.com",
                port: 443,
                remoteProtocol: RemoteProtocol.TLS,
              } as Allow,
            ],
          },
        },
      },
      {
        apiVersion: "uds.dev/v1alpha1",
        kind: "Package",
        metadata: { name: "pkg2", namespace: "ns2" },
        spec: {
          network: {
            serviceMesh: { mode: Mode.Ambient },
            allow: [
              {
                direction: Direction.Egress,
                remoteGenerated: RemoteGenerated.Anywhere,
                ports: [80],
                serviceAccount: "caller",
              } as Allow,
            ],
          },
        },
      },
    ];

    const apSpy = vi.spyOn(apMod, "generateCentralAmbientEgressAuthorizationPolicy");

    await applyAmbientEgressResources(buildAmbientMap(pkgItems), 13);

    expect(apSpy).toHaveBeenCalledTimes(1);
    const byPort = apSpy.mock.calls[0][4] as
      | Record<string, { saPrincipals: string[]; namespaces: string[] }>
      | undefined;
    expect(byPort).toBeDefined();
    expect(byPort).toHaveProperty("80");
    expect(byPort).toHaveProperty("443");
    expect(byPort!["80"].saPrincipals).toEqual(
      expect.arrayContaining(["cluster.local/ns/ns2/sa/caller"]),
    );
    expect(byPort!["443"].saPrincipals).not.toEqual(
      expect.arrayContaining(["cluster.local/ns/ns2/sa/caller"]),
    );

    apSpy.mockRestore();
  });

  it("should ignore deleting packages when resolving Anywhere participants", async () => {
    updateEgressMocks(defaultEgressMocks);

    const pkgItems: UDSPackage[] = [
      {
        apiVersion: "uds.dev/v1alpha1",
        kind: "Package",
        metadata: { name: "pkg1", namespace: "ns1" },
        spec: {
          network: {
            serviceMesh: { mode: Mode.Ambient },
            allow: [
              {
                direction: Direction.Egress,
                remoteHost: "example.com",
                port: 443,
                remoteProtocol: RemoteProtocol.TLS,
                serviceAccount: "owner",
              } as Allow,
            ],
          },
        },
      },
      {
        apiVersion: "uds.dev/v1alpha1",
        kind: "Package",
        metadata: {
          name: "pkg2",
          namespace: "ns2",
          deletionTimestamp: new Date("2025-01-01T00:00:00Z"),
        },
        spec: {
          network: {
            serviceMesh: { mode: Mode.Ambient },
            allow: [
              {
                direction: Direction.Egress,
                remoteGenerated: RemoteGenerated.Anywhere,
                serviceAccount: "caller",
              } as Allow,
            ],
          },
        },
      },
    ];

    const apSpy = vi.spyOn(apMod, "generateCentralAmbientEgressAuthorizationPolicy");

    await applyAmbientEgressResources(buildAmbientMap(pkgItems), 14);

    expect(apSpy).toHaveBeenCalledTimes(1);
    const byPort = apSpy.mock.calls[0][4] as
      | Record<string, { saPrincipals: string[]; namespaces: string[] }>
      | undefined;
    expect(byPort).toBeDefined();
    expect(byPort).toHaveProperty("443");
    expect(byPort!["443"].saPrincipals).not.toEqual(
      expect.arrayContaining(["cluster.local/ns/ns2/sa/caller"]),
    );
  });

  it("should ignore deleting packages when resolving host owner identities", async () => {
    updateEgressMocks(defaultEgressMocks);

    const pkgItems: UDSPackage[] = [
      {
        apiVersion: "uds.dev/v1alpha1",
        kind: "Package",
        metadata: {
          name: "pkg1",
          namespace: "ns1",
          deletionTimestamp: new Date("2025-01-01T00:00:00Z"),
        },
        spec: {
          network: {
            serviceMesh: { mode: Mode.Ambient },
            allow: [
              {
                direction: Direction.Egress,
                remoteHost: "example.com",
                port: 443,
                remoteProtocol: RemoteProtocol.TLS,
                serviceAccount: "owner",
              } as Allow,
            ],
          },
        },
      },
      {
        apiVersion: "uds.dev/v1alpha1",
        kind: "Package",
        metadata: { name: "pkg2", namespace: "ns2" },
        spec: {
          network: {
            serviceMesh: { mode: Mode.Ambient },
            allow: [
              {
                direction: Direction.Egress,
                remoteHost: "example.com",
                port: 443,
                remoteProtocol: RemoteProtocol.TLS,
              } as Allow,
            ],
          },
        },
      },
      {
        apiVersion: "uds.dev/v1alpha1",
        kind: "Package",
        metadata: { name: "pkg3", namespace: "ns3" },
        spec: {
          network: {
            serviceMesh: { mode: Mode.Ambient },
            allow: [
              {
                direction: Direction.Egress,
                remoteGenerated: RemoteGenerated.Anywhere,
                serviceAccount: "caller",
              } as Allow,
            ],
          },
        },
      },
    ];

    const apSpy = vi.spyOn(apMod, "generateCentralAmbientEgressAuthorizationPolicy");

    await applyAmbientEgressResources(buildAmbientMap(pkgItems), 15);

    expect(apSpy).toHaveBeenCalledTimes(1);
    const byPort = apSpy.mock.calls[0][4] as
      | Record<string, { saPrincipals: string[]; namespaces: string[] }>
      | undefined;
    expect(byPort).toBeDefined();
    expect(byPort).toHaveProperty("443");
    expect(byPort!["443"].saPrincipals).not.toEqual(
      expect.arrayContaining(["cluster.local/ns/ns1/sa/owner"]),
    );

    apSpy.mockRestore();
  });

  it("should not include port-scoped Anywhere participant when ports do not cover host ports", async () => {
    updateEgressMocks(defaultEgressMocks);

    const pkgItems: UDSPackage[] = [
      {
        apiVersion: "uds.dev/v1alpha1",
        kind: "Package",
        metadata: { name: "pkg1", namespace: "ns1" },
        spec: {
          network: {
            serviceMesh: { mode: Mode.Ambient },
            allow: [
              {
                direction: Direction.Egress,
                remoteHost: "api.github.com",
                port: 443,
                remoteProtocol: RemoteProtocol.TLS,
              } as Allow,
            ],
          },
        },
      },
      {
        apiVersion: "uds.dev/v1alpha1",
        kind: "Package",
        metadata: { name: "pkg2", namespace: "ns2" },
        spec: {
          network: {
            serviceMesh: { mode: Mode.Ambient },
            allow: [
              {
                direction: Direction.Egress,
                remoteGenerated: RemoteGenerated.Anywhere,
                ports: [80, 8080],
                serviceAccount: "caller",
              } as Allow,
            ],
          },
        },
      },
    ];

    const apSpy = vi.spyOn(apMod, "generateCentralAmbientEgressAuthorizationPolicy");

    await applyAmbientEgressResources(buildAmbientMap(pkgItems), 11);

    expect(apSpy).toHaveBeenCalledTimes(1);
    const identities = apSpy.mock.calls[0][2];
    expect(identities.saPrincipals).not.toEqual(
      expect.arrayContaining(["cluster.local/ns/ns2/sa/caller"]),
    );
    expect(apSpy.mock.calls[0][3]).toBeDefined();
    const byPort = apSpy.mock.calls[0][4] as
      | Record<string, { saPrincipals: string[]; namespaces: string[] }>
      | undefined;
    expect(byPort).toBeDefined();
    expect(byPort).toHaveProperty("443");
    expect(byPort!["443"].saPrincipals).not.toEqual(
      expect.arrayContaining(["cluster.local/ns/ns2/sa/caller"]),
    );

    apSpy.mockRestore();
  });

  it("should include unscoped Anywhere participant for all hosts regardless of ports", async () => {
    updateEgressMocks(defaultEgressMocks);

    const pkgItems: UDSPackage[] = [
      {
        apiVersion: "uds.dev/v1alpha1",
        kind: "Package",
        metadata: { name: "pkg1", namespace: "ns1" },
        spec: {
          network: {
            serviceMesh: { mode: Mode.Ambient },
            allow: [
              {
                direction: Direction.Egress,
                remoteHost: "example.com",
                port: 80,
                remoteProtocol: RemoteProtocol.HTTP,
              } as Allow,
            ],
          },
        },
      },
      {
        apiVersion: "uds.dev/v1alpha1",
        kind: "Package",
        metadata: { name: "pkg2", namespace: "ns2" },
        spec: {
          network: {
            serviceMesh: { mode: Mode.Ambient },
            allow: [
              {
                direction: Direction.Egress,
                remoteHost: "api.github.com",
                port: 443,
                remoteProtocol: RemoteProtocol.TLS,
              } as Allow,
            ],
          },
        },
      },
      {
        apiVersion: "uds.dev/v1alpha1",
        kind: "Package",
        metadata: { name: "pkg3", namespace: "ns3" },
        spec: {
          network: {
            serviceMesh: { mode: Mode.Ambient },
            allow: [
              {
                direction: Direction.Egress,
                remoteGenerated: RemoteGenerated.Anywhere,
                serviceAccount: "caller",
              } as Allow,
            ],
          },
        },
      },
    ];

    const apSpy = vi.spyOn(apMod, "generateCentralAmbientEgressAuthorizationPolicy");

    await applyAmbientEgressResources(buildAmbientMap(pkgItems), 12);

    expect(apSpy).toHaveBeenCalledTimes(2);
    const calls = apSpy.mock.calls;
    for (const c of calls) {
      const identities = c[2];
      expect(identities.saPrincipals).toEqual(
        expect.arrayContaining(["cluster.local/ns/ns3/sa/caller"]),
      );
      expect(c[3]).toBeDefined();
      const host = c[0];
      const port = host === "example.com" ? "80" : "443";
      const byPort = c[4] as
        | Record<string, { saPrincipals: string[]; namespaces: string[] }>
        | undefined;
      expect(byPort).toBeDefined();
      expect(byPort).toHaveProperty(port);
      expect(byPort![port].saPrincipals).toEqual(
        expect.arrayContaining(["cluster.local/ns/ns3/sa/caller"]),
      );
    }

    apSpy.mockRestore();
  });

  it("should remove Anywhere participant from central AP identities after deletion", async () => {
    updateEgressMocks(defaultEgressMocks);

    const apSpy = vi.spyOn(apMod, "generateCentralAmbientEgressAuthorizationPolicy");

    // First reconcile: owner + Anywhere participant
    const pkgItems: UDSPackage[] = [
      {
        apiVersion: "uds.dev/v1alpha1",
        kind: "Package",
        metadata: { name: "pkg1", namespace: "ns1" },
        spec: {
          network: {
            serviceMesh: { mode: Mode.Ambient },
            allow: [
              {
                direction: Direction.Egress,
                remoteHost: "example.com",
                port: 443,
                remoteProtocol: RemoteProtocol.TLS,
              } as Allow,
            ],
          },
        },
      },
      {
        apiVersion: "uds.dev/v1alpha1",
        kind: "Package",
        metadata: { name: "pkg2", namespace: "ns2" },
        spec: {
          network: {
            serviceMesh: { mode: Mode.Ambient },
            allow: [
              {
                direction: Direction.Egress,
                remoteGenerated: RemoteGenerated.Anywhere,
                serviceAccount: "caller",
              } as Allow,
            ],
          },
        },
      },
    ];

    await applyAmbientEgressResources(buildAmbientMap(pkgItems), 7);
    // Ensure participant included
    const firstIdentities = apSpy.mock.calls[0][2];
    expect(firstIdentities.saPrincipals).toEqual(
      expect.arrayContaining(["cluster.local/ns/ns2/sa/caller"]),
    );

    apSpy.mockClear();

    // Second reconcile: participant removed
    const pkgItems2: UDSPackage[] = [
      {
        apiVersion: "uds.dev/v1alpha1",
        kind: "Package",
        metadata: { name: "pkg1", namespace: "ns1" },
        spec: {
          network: {
            serviceMesh: { mode: Mode.Ambient },
            allow: [
              {
                direction: Direction.Egress,
                remoteHost: "example.com",
                port: 443,
                remoteProtocol: RemoteProtocol.TLS,
              } as Allow,
            ],
          },
        },
      },
    ];

    await applyAmbientEgressResources(buildAmbientMap(pkgItems2), 8);

    // Ensure participant no longer included
    const secondIdentities = apSpy.mock.calls[0][2];
    expect(secondIdentities.saPrincipals).not.toEqual(
      expect.arrayContaining(["cluster.local/ns/ns2/sa/caller"]),
    );

    apSpy.mockRestore();
  });

  it("should deduplicate and sort identities before generating AP", async () => {
    updateEgressMocks(defaultEgressMocks);

    // Spy on AP generator to capture identities passed in
    const apSpy = vi.spyOn(apMod, "generateCentralAmbientEgressAuthorizationPolicy");

    const pkgItems: UDSPackage[] = [
      // Owner of example.com
      {
        apiVersion: "uds.dev/v1alpha1",
        kind: "Package",
        metadata: { name: "pkg1", namespace: "ns1" },
        spec: {
          network: {
            serviceMesh: { mode: Mode.Ambient },
            allow: [
              {
                direction: Direction.Egress,
                remoteHost: "example.com",
                port: 443,
                remoteProtocol: RemoteProtocol.TLS,
                serviceAccount: "sa1",
              } as Allow,
            ],
          },
        },
      },
      // Anywhere participant with same SA in another allow to create duplicates across owners/participants
      {
        apiVersion: "uds.dev/v1alpha1",
        kind: "Package",
        metadata: { name: "pkg2", namespace: "ns2" },
        spec: {
          network: {
            serviceMesh: { mode: Mode.Ambient },
            allow: [
              {
                direction: Direction.Egress,
                remoteGenerated: RemoteGenerated.Anywhere,
                serviceAccount: "sa1", // will create overlapping principal (different ns though, so distinct)
              } as Allow,
              {
                direction: Direction.Egress,
                remoteGenerated: RemoteGenerated.Anywhere,
              } as Allow, // ns2 as namespace participant
            ],
          },
        },
      },
      // Another package that also owns example.com (duplicate owner SA)
      {
        apiVersion: "uds.dev/v1alpha1",
        kind: "Package",
        metadata: { name: "pkg3", namespace: "ns1" },
        spec: {
          network: {
            serviceMesh: { mode: Mode.Ambient },
            allow: [
              {
                direction: Direction.Egress,
                remoteHost: "example.com",
                port: 443,
                remoteProtocol: RemoteProtocol.TLS,
                serviceAccount: "sa1", // same SA as pkg1/ns1
              } as Allow,
            ],
          },
        },
      },
    ];

    await applyAmbientEgressResources(buildAmbientMap(pkgItems), 5);

    // Verify AP generation called once and identities sorted/deduped
    expect(apSpy).toHaveBeenCalledTimes(1);
    const call = apSpy.mock.calls[0];
    const identities = call[2];
    expect(identities.saPrincipals).toEqual(
      [
        // owner SA for ns1/sa1 should appear once
        "cluster.local/ns/ns1/sa/sa1",
        // participant SA (ns2/sa1)
        "cluster.local/ns/ns2/sa/sa1",
      ].sort(),
    );
    expect(identities.namespaces).toEqual(["ns2"]); // participant namespace

    apSpy.mockRestore();
  });

  it("should merge owners and Anywhere participants and apply SE/AP", async () => {
    updateEgressMocks(defaultEgressMocks);

    // Live packages: one owner with SA, and two Anywhere participants (one SA, one namespace)
    const pkgItems: UDSPackage[] = [
      {
        apiVersion: "uds.dev/v1alpha1",
        kind: "Package",
        metadata: { name: "pkg1", namespace: "ns1" },
        spec: {
          network: {
            serviceMesh: { mode: Mode.Ambient },
            allow: [
              {
                direction: Direction.Egress,
                remoteHost: "example.com",
                port: 443,
                remoteProtocol: RemoteProtocol.TLS,
                // owner SA
                serviceAccount: "sa1",
              } as Allow,
              {
                direction: Direction.Egress,
                remoteHost: "example.com",
                port: 80,
                remoteProtocol: RemoteProtocol.HTTP,
              } as Allow,
            ],
          },
        },
      },
      {
        apiVersion: "uds.dev/v1alpha1",
        kind: "Package",
        metadata: { name: "pkg2", namespace: "ns2" },
        spec: {
          network: {
            serviceMesh: { mode: Mode.Ambient },
            allow: [
              {
                direction: Direction.Egress,
                remoteGenerated: RemoteGenerated.Anywhere,
                serviceAccount: "sa2", // participant SA
              } as Allow,
            ],
          },
        },
      },
      {
        apiVersion: "uds.dev/v1alpha1",
        kind: "Package",
        metadata: { name: "pkg3", namespace: "ns3" },
        spec: {
          network: {
            serviceMesh: { mode: Mode.Ambient },
            allow: [
              {
                direction: Direction.Egress,
                remoteGenerated: RemoteGenerated.Anywhere, // participant namespace
              } as Allow,
            ],
          },
        },
      },
    ];

    const seSpy = vi.spyOn(seMod, "generateSharedAmbientServiceEntry");
    const apSpy = vi.spyOn(apMod, "generateCentralAmbientEgressAuthorizationPolicy");

    await applyAmbientEgressResources(buildAmbientMap(pkgItems), 1);

    // Waypoint applied, plus one SE and one AP for example.com
    expect(defaultEgressMocks.applyWaypointMock).toHaveBeenCalledTimes(1);
    expect(defaultEgressMocks.applySeMock).toHaveBeenCalledTimes(1);
    expect(defaultEgressMocks.applyApMock).toHaveBeenCalledTimes(1);

    // Validate merged ServiceEntry (generator inputs)
    expect(seSpy).toHaveBeenCalledTimes(1);
    const [seHost, seResource, seGeneration] = seSpy.mock.calls[0] as [
      string,
      { portProtocols: { port: number; protocol: RemoteProtocol }[] },
      number,
    ];
    expect(seHost).toBe("example.com");
    expect(seGeneration).toBe(1);
    expect(seResource.portProtocols).toEqual(
      expect.arrayContaining([
        { port: 443, protocol: RemoteProtocol.TLS },
        { port: 80, protocol: RemoteProtocol.HTTP },
      ]),
    );

    // Validate merged AuthorizationPolicy (generator inputs)
    expect(apSpy).toHaveBeenCalledTimes(1);
    const [apHost, apGeneration, identities] = apSpy.mock.calls[0] as [
      string,
      number,
      { saPrincipals: string[]; namespaces: string[] },
    ];
    expect(apHost).toBe("example.com");
    expect(apGeneration).toBe(1);
    expect(identities.saPrincipals).toEqual(
      expect.arrayContaining(["cluster.local/ns/ns1/sa/sa1", "cluster.local/ns/ns2/sa/sa2"]),
    );
    expect(identities.namespaces).toEqual(expect.arrayContaining(["ns3"]));
  });

  it("should skip SE/AP when identities are empty (owners and participants not resolved)", async () => {
    updateEgressMocks(defaultEgressMocks);

    const pkgItems: UDSPackage[] = [];

    await applyAmbientEgressResources(buildAmbientMap(pkgItems), 1);

    expect(defaultEgressMocks.applyWaypointMock).not.toHaveBeenCalled();
    expect(defaultEgressMocks.applySeMock).not.toHaveBeenCalled();
    expect(defaultEgressMocks.applyApMock).not.toHaveBeenCalled();
  });

  // Mock a scenario where direct identity lookup fails but fallback works
  // This can happen if the in-memory package maps get out of sync with the store
  it("should handle multi-stage fallback for identity resolution", async () => {
    updateEgressMocks(defaultEgressMocks);

    // Only pkg1-ns1 is active in the cluster (pkg2-ns2 was deleted/changed)
    const pkgItems: UDSPackage[] = [
      {
        apiVersion: "uds.dev/v1alpha1",
        kind: "Package",
        metadata: { name: "pkg1", namespace: "ns1" },
        spec: {
          network: {
            serviceMesh: { mode: Mode.Ambient },
            allow: [
              {
                direction: Direction.Egress,
                remoteHost: "example.com",
                serviceAccount: "partial-sa",
              } as Allow,
            ],
          },
        },
      },
      // Other package that doesn't match example.com
      {
        apiVersion: "uds.dev/v1alpha1",
        kind: "Package",
        metadata: { name: "pkg3", namespace: "ns3" },
        spec: {
          network: {
            serviceMesh: { mode: Mode.Ambient },
            allow: [
              {
                direction: Direction.Egress,
                remoteHost: "different-host.com",
              } as Allow,
            ],
          },
        },
      },
    ];

    // Spy on the auth policy generator to check identity resolution
    const apSpy = vi.spyOn(apMod, "generateCentralAmbientEgressAuthorizationPolicy");

    await applyAmbientEgressResources(buildAmbientMap(pkgItems), 1);

    expect(apSpy).toHaveBeenCalledTimes(2);
    const identities = apSpy.mock.calls.find(call => call[0] === "example.com")?.[2];
    expect(identities).toBeDefined();

    // Should only include the identity from the live Package (pkg1) not the missing one (pkg2)
    expect(identities!.saPrincipals).toEqual(["cluster.local/ns/ns1/sa/partial-sa"]);
    expect(identities!.namespaces).toEqual([]);

    // Waypoint and ServiceEntry should be created
    expect(defaultEgressMocks.applyWaypointMock).toHaveBeenCalledTimes(1);
    expect(defaultEgressMocks.applySeMock).toHaveBeenCalledTimes(2);
    expect(defaultEgressMocks.applyApMock).toHaveBeenCalledTimes(2);

    apSpy.mockRestore();
  });

  it("should apply ambient egress resources", async () => {
    updateEgressMocks(defaultEgressMocks);

    const pkgItems: UDSPackage[] = [
      {
        apiVersion: "uds.dev/v1alpha1",
        kind: "Package",
        metadata: { name: "test-package-1", namespace: "test-ns" },
        spec: {
          network: {
            serviceMesh: { mode: Mode.Ambient },
            allow: [
              {
                direction: Direction.Egress,
                remoteHost: "example.com",
                remoteProtocol: RemoteProtocol.TLS,
                port: 443,
              } as Allow,
            ],
          },
        },
      },
      {
        apiVersion: "uds.dev/v1alpha1",
        kind: "Package",
        metadata: { name: "test-package-2", namespace: "test-ns" },
        spec: {
          network: {
            serviceMesh: { mode: Mode.Ambient },
            allow: [
              {
                direction: Direction.Egress,
                remoteHost: "example.com",
                remoteProtocol: RemoteProtocol.TLS,
                port: 443,
              } as Allow,
            ],
          },
        },
      },
    ];

    await applyAmbientEgressResources(buildAmbientMap(pkgItems), 1);

    expect(defaultEgressMocks.applyWaypointMock).toHaveBeenCalledTimes(1);
  });

  it("should handle empty package set", async () => {
    updateEgressMocks(defaultEgressMocks);

    await expect(applyAmbientEgressResources(buildAmbientMap([]), 1)).resolves.not.toThrow();

    // No resources should be applied for empty set
    expect(defaultEgressMocks.applyWaypointMock).not.toHaveBeenCalled();
  });

  it("should throw if waypoint pod is not healthy", async () => {
    updateEgressMocks(defaultEgressMocks);

    // Ensure there is at least one ambient remoteHost contributor so the waypoint is applied.
    const pkgItems: UDSPackage[] = [
      {
        apiVersion: "uds.dev/v1alpha1",
        kind: "Package",
        metadata: { name: "test-package-1", namespace: "test-ns" },
        spec: {
          network: {
            serviceMesh: { mode: Mode.Ambient },
            allow: [
              {
                direction: Direction.Egress,
                remoteHost: "example.com",
                remoteProtocol: RemoteProtocol.TLS,
                port: 443,
              } as Allow,
            ],
          },
        },
      },
    ];

    // Mock waitForWaypointPodHealthy to reject
    const mockWaitForWaypointPodHealthy = vi.mocked(waitForWaypointPodHealthy);
    mockWaitForWaypointPodHealthy.mockRejectedValueOnce(new Error("Pod health check failed"));

    // Should throw the error from waitForWaypointPodHealthy
    await expect(applyAmbientEgressResources(buildAmbientMap(pkgItems), 1)).rejects.toThrow(
      "Pod health check failed",
    );

    // Should still have applied the waypoint before the failure
    expect(defaultEgressMocks.applyWaypointMock).toHaveBeenCalledTimes(1);
    expect(mockWaitForWaypointPodHealthy).toHaveBeenCalledTimes(1);
  });
});

describe("test purgeAmbientEgressResources", () => {
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

    await purgeAmbientEgressResources({}, "1");

    // Purges Gateway, ServiceEntry, and AuthorizationPolicy in ambient namespace
    expect(mockPurgeOrphans).toHaveBeenCalledTimes(3);
  });

  it("should handle purge error", async () => {
    const errorMessage = "Purge error";

    mockPurgeOrphans.mockRejectedValueOnce(new Error(errorMessage));

    await expect(purgeAmbientEgressResources({}, "1")).rejects.toThrow(
      "Failed to purge orphaned ambient egress resources",
    );
  });
});
