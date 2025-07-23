/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { describe, expect, it } from "vitest";
import { Expose, Gateway, IstioLocation, IstioResolution, RemoteProtocol } from "../../crd";
import { UDSConfig } from "../config/config";
import { ownerRefsMock } from "./defaultTestMocks";
import {
  sidecarEgressNamespace,
  sharedEgressPkgId as sidecarSharedEgressPkgId,
} from "./egress-sidecar";
import { ambientEgressNamespace } from "./egress-ambient";
import {
  generateIngressServiceEntry,
  generateLocalEgressServiceEntry,
  generateSharedServiceEntry,
} from "./service-entry";
import { EgressResource, HostResource } from "./types";
import { waypointName } from "./waypoint";

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
});

describe("test generate local egress service entry", () => {
  const host = "example.com";
  const cleanHost = "example-com";
  const namespace = "test-namespace";
  const packageName = "test-pkg";
  const generation = "1";

  it("should create a local egress ServiceEntry object, non ambient", () => {
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
      false,
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

  it("should create a local egress ServiceEntry with multiple ports, non ambient", () => {
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
      false,
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
      true,
    );

    expect(serviceEntry).toBeDefined();
    expect(serviceEntry.metadata?.name).toEqual(
      `${packageName}-egress-${cleanHost}-${port.toString()}-${protocol.toLowerCase()}`,
    );
    expect(serviceEntry.metadata?.namespace).toEqual(namespace);
    expect(serviceEntry.metadata?.labels).toEqual({
      "uds/package": packageName,
      "uds/generation": generation,
      "istio.io/use-waypoint": waypointName,
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
