/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { beforeEach, describe, expect, it } from "vitest";
import { Mode } from "../../crd/generated/package-v1alpha1.js";
import {
  Expose,
  Gateway,
  IstioLocation,
  IstioResolution,
  RemoteProtocol,
} from "../../crd/index.js";
import { UDSConfig } from "../config/config.js";
import { egressWaypointName } from "./ambient-waypoint.js";
import { ownerRefsMock } from "./defaultTestMocks.js";
import {
  sidecarEgressNamespace,
  sharedEgressPkgId as sidecarSharedEgressPkgId,
} from "./egress-sidecar.js";
import { ambientEgressNamespace } from "./istio-resources.js";
import {
  generateIngressServiceEntry,
  generateLocalEgressServiceEntry,
  generateSharedAmbientServiceEntry,
  generateSharedServiceEntry,
} from "./service-entry.js";
import { EgressResource, HostResource } from "./types.js";

beforeEach(() => {
  UDSConfig.domain = "uds.dev";
  UDSConfig.adminDomain = "admin.uds.dev";
});

describe("test generate shared ambient service entry", () => {
  it("should create a shared ambient ServiceEntry object with waypoint binding and annotations", () => {
    const host = "example.com";
    const resource: EgressResource = {
      packages: ["pkg1-ns1", "pkg2-ns2"],
      portProtocols: [
        { port: 443, protocol: RemoteProtocol.TLS },
        { port: 80, protocol: RemoteProtocol.HTTP },
      ],
    };
    const generation = 2;

    const serviceEntry = generateSharedAmbientServiceEntry(host, resource, generation);

    expect(serviceEntry).toBeDefined();
    expect(serviceEntry.metadata?.name).toEqual("ambient-se-example-com");
    expect(serviceEntry.metadata?.namespace).toEqual(ambientEgressNamespace);
    expect(serviceEntry.metadata?.labels).toEqual({
      "istio.io/use-waypoint": egressWaypointName,
      "istio.io/use-waypoint-namespace": ambientEgressNamespace,
      "uds/package": "shared-ambient-egress-resource",
      "uds/generation": generation.toString(),
    });
    // annotations include an entry per contributing package
    expect(serviceEntry.metadata?.annotations).toMatchObject({
      "uds.dev/user-pkg1-ns1": "user",
      "uds.dev/user-pkg2-ns2": "user",
    });

    expect(serviceEntry.spec?.hosts?.[0]).toEqual(host);
    expect(serviceEntry.spec?.ports?.length).toEqual(2);
    expect(serviceEntry.spec?.ports?.map(p => p.number).sort((a, b) => a - b)).toEqual([80, 443]);
    expect(serviceEntry.spec?.location).toEqual(IstioLocation.MeshExternal);
    expect(serviceEntry.spec?.resolution).toEqual(IstioResolution.DNS);
    expect(serviceEntry.spec?.exportTo?.[0]).toEqual(".");
  });

  it("should cap long hostnames for ambient SE name within K8s limits", () => {
    const longLabel = "a".repeat(200);
    const host = `${longLabel}.${longLabel}.${longLabel}.example.com`;
    const resource: EgressResource = {
      packages: ["pkg1-ns1"],
      portProtocols: [{ port: 443, protocol: RemoteProtocol.TLS }],
    };
    const generation = 1;

    const se = generateSharedAmbientServiceEntry(host, resource, generation);

    expect(se.metadata?.name).toBeDefined();
    expect(se.metadata!.name!.length).toBeLessThanOrEqual(253);
    expect(se.metadata!.name!).toMatch(/^ambient-se-/);
  });
});

describe("test generate service entry", () => {
  const ownerRefs = [
    {
      apiVersion: "uds.dev/v1alpha1",
      kind: "Package",
      name: "test",
      uid: "f50120aa-2713-4502-9496-566b102b1174",
    },
  ];

  const host = "test";
  const port = 8080;
  const service = "test-service";

  const namespace = "test";
  const pkgName = "test";
  const generation = "1";

  it("should create a simple ServiceEntry object", () => {
    const expose: Expose = {
      host,
      port,
      service,
    };

    const payload = generateIngressServiceEntry(expose, namespace, pkgName, generation, ownerRefs);

    expect(payload).toBeDefined();
    expect(payload.metadata?.name).toEqual(`${pkgName}-${Gateway.Tenant}-${host}`);
    expect(payload.metadata?.namespace).toEqual(namespace);

    expect(payload.spec?.hosts).toBeDefined();
    expect(payload.spec!.hosts![0]).toEqual(`${host}.${UDSConfig.domain}`);

    expect(payload.spec!.location).toEqual(IstioLocation.MeshInternal);
    expect(payload.spec!.resolution).toEqual(IstioResolution.DNS);

    expect(payload.spec?.ports).toBeDefined();
    expect(payload.spec!.ports![0].name).toEqual("https");
    expect(payload.spec!.ports![0].number).toEqual(443);
    expect(payload.spec!.ports![0].protocol).toEqual("HTTPS");

    expect(payload.spec?.endpoints).toBeDefined();
    expect(payload.spec!.endpoints![0].address).toEqual(
      `${Gateway.Tenant}-ingressgateway.istio-${Gateway.Tenant}-gateway.svc.cluster.local`,
    );
  });

  it("should create a root domain ServiceEntry object for tenant gateway", () => {
    const expose: Expose = {
      host: ".",
      port,
      service,
    };

    const payload = generateIngressServiceEntry(expose, namespace, pkgName, generation, ownerRefs);

    expect(payload).toBeDefined();
    expect(payload.metadata?.name).toContain("root-domain");
    expect(payload.spec?.hosts).toBeDefined();
    expect(payload.spec!.hosts![0]).toEqual(UDSConfig.domain);
    expect(payload.spec?.endpoints?.[0].address).toContain(Gateway.Tenant);
  });

  it("should create a root domain ServiceEntry object for admin gateway", () => {
    const expose: Expose = {
      gateway: Gateway.Admin,
      host: ".",
      port,
      service,
    };

    const payload = generateIngressServiceEntry(expose, namespace, pkgName, generation, ownerRefs);

    expect(payload).toBeDefined();
    expect(payload.metadata?.name).toContain("root-domain");
    expect(payload.spec?.hosts).toBeDefined();
    expect(payload.spec!.hosts![0]).toEqual(UDSConfig.adminDomain);
    expect(payload.spec?.endpoints?.[0].address).toContain(Gateway.Admin);
  });
});

describe("test generate local egress service entry", () => {
  const host = "example.com";
  const cleanHost = "example-com";
  const namespace = "test-namespace";
  const packageName = "test-pkg";
  const generation = "1";

  it("should create a local egress ServiceEntry object, sidecar", () => {
    const port = 80;
    const protocol = RemoteProtocol.HTTP;

    const hostResource: HostResource = {
      portProtocol: [{ port: port, protocol: protocol }],
    };

    const serviceEntry = generateLocalEgressServiceEntry(
      host,
      hostResource,
      packageName,
      namespace,
      generation,
      ownerRefsMock,
      Mode.Sidecar,
    );

    expect(serviceEntry).toBeDefined();
    expect(serviceEntry.metadata?.name).toEqual(
      `${packageName}-egress-${cleanHost}-${port.toString()}-${protocol.toLowerCase()}`,
    );
    expect(serviceEntry.metadata?.namespace).toEqual(namespace);
    expect(serviceEntry.metadata?.labels).toEqual({
      "uds/package": packageName,
      "uds/generation": generation,
    });
    expect(serviceEntry.metadata?.ownerReferences).toBeDefined();
    expect(serviceEntry.spec?.hosts).toBeDefined();
    expect(serviceEntry.spec?.hosts![0]).toEqual(host);
    expect(serviceEntry.spec?.ports).toBeDefined();
    expect(serviceEntry.spec?.ports![0].number).toEqual(port);
    expect(serviceEntry.spec?.ports![0].protocol).toEqual(protocol);
    expect(serviceEntry.spec!.location).toEqual(IstioLocation.MeshExternal);
    expect(serviceEntry.spec!.resolution).toEqual(IstioResolution.DNS);
    expect(serviceEntry.spec!.exportTo?.[0]).toEqual(".");
  });

  it("should create a local egress ServiceEntry with multiple ports, sidecar", () => {
    const port1 = 80;
    const protocol1 = RemoteProtocol.HTTP;
    const port2 = 443;
    const protocol2 = RemoteProtocol.TLS;

    const hostResource: HostResource = {
      portProtocol: [
        { port: port1, protocol: protocol1 },
        { port: port2, protocol: protocol2 },
      ],
    };

    const serviceEntry = generateLocalEgressServiceEntry(
      host,
      hostResource,
      packageName,
      namespace,
      generation,
      ownerRefsMock,
      Mode.Sidecar,
    );

    expect(serviceEntry).toBeDefined();
    expect(serviceEntry.metadata?.name).toEqual(
      `${packageName}-egress-${cleanHost}-${port1.toString()}-${protocol1.toLowerCase()}-${port2.toString()}-${protocol2.toLowerCase()}`,
    );
    expect(serviceEntry.metadata?.namespace).toEqual(namespace);
    expect(serviceEntry.metadata?.labels).toEqual({
      "uds/package": packageName,
      "uds/generation": generation,
    });
    expect(serviceEntry.metadata?.ownerReferences).toBeDefined();
    expect(serviceEntry.spec?.hosts).toBeDefined();
    expect(serviceEntry.spec?.hosts![0]).toEqual(host);
    expect(serviceEntry.spec?.ports).toBeDefined();
    expect(serviceEntry.spec?.ports![0].number).toEqual(port1);
    expect(serviceEntry.spec?.ports![0].protocol).toEqual(protocol1);
    expect(serviceEntry.spec?.ports![1].number).toEqual(port2);
    expect(serviceEntry.spec?.ports![1].protocol).toEqual(protocol2);
    expect(serviceEntry.spec!.location).toEqual(IstioLocation.MeshExternal);
    expect(serviceEntry.spec!.resolution).toEqual(IstioResolution.DNS);
    expect(serviceEntry.spec!.exportTo?.[0]).toEqual(".");
  });

  it("should create a local egress ServiceEntry object, ambient", () => {
    const port = 80;
    const protocol = RemoteProtocol.HTTP;

    const hostResource: HostResource = {
      portProtocol: [{ port: port, protocol: protocol }],
    };

    const serviceEntry = generateLocalEgressServiceEntry(
      host,
      hostResource,
      packageName,
      namespace,
      generation,
      ownerRefsMock,
      Mode.Ambient,
    );

    expect(serviceEntry).toBeDefined();
    expect(serviceEntry.metadata?.name).toEqual(
      `${packageName}-egress-${cleanHost}-${port.toString()}-${protocol.toLowerCase()}`,
    );
    expect(serviceEntry.metadata?.namespace).toEqual(namespace);
    expect(serviceEntry.metadata?.labels).toEqual({
      "uds/package": packageName,
      "uds/generation": generation,
      "istio.io/use-waypoint": egressWaypointName,
      "istio.io/use-waypoint-namespace": ambientEgressNamespace,
    });
    expect(serviceEntry.metadata?.ownerReferences).toBeDefined();
    expect(serviceEntry.spec?.hosts).toBeDefined();
    expect(serviceEntry.spec?.hosts![0]).toEqual(host);
    expect(serviceEntry.spec?.ports).toBeDefined();
    expect(serviceEntry.spec?.ports![0].number).toEqual(port);
    expect(serviceEntry.spec?.ports![0].protocol).toEqual(protocol);
    expect(serviceEntry.spec!.location).toEqual(IstioLocation.MeshExternal);
    expect(serviceEntry.spec!.resolution).toEqual(IstioResolution.DNS);
    expect(serviceEntry.spec!.exportTo?.[0]).toEqual(".");
  });
});

describe("test generate shared egress service entry", () => {
  it("should create a local egress ServiceEntry object", () => {
    const host = "example.com";
    const resource: EgressResource = {
      packages: ["test-pkg1", "test-pkg2"],
      portProtocols: [
        { port: 443, protocol: RemoteProtocol.TLS },
        { port: 80, protocol: RemoteProtocol.HTTP },
      ],
    };
    const generation = 1;

    const serviceEntry = generateSharedServiceEntry(host, resource, generation);

    expect(serviceEntry).toBeDefined();
    expect(serviceEntry.metadata?.name).toEqual("service-entry-example-com");
    expect(serviceEntry.metadata?.namespace).toEqual(sidecarEgressNamespace);
    expect(serviceEntry.metadata?.labels).toEqual({
      "uds/package": sidecarSharedEgressPkgId,
      "uds/generation": generation.toString(),
    });
    expect(serviceEntry.spec?.hosts).toBeDefined();
    expect(serviceEntry.spec?.hosts![0]).toEqual(host);
    expect(serviceEntry.spec?.ports).toBeDefined();
    expect(serviceEntry.spec?.ports?.length).toEqual(2);
    expect(serviceEntry.spec!.location).toEqual(IstioLocation.MeshExternal);
    expect(serviceEntry.spec!.resolution).toEqual(IstioResolution.DNS);
    expect(serviceEntry.spec!.exportTo?.[0]).toEqual(".");
  });
});
