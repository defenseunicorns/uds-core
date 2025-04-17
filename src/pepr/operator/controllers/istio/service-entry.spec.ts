/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { describe, expect, it } from "@jest/globals";
import { UDSConfig } from "../../../config";
import { Expose, Gateway, IstioLocation, IstioResolution, RemoteProtocol } from "../../crd";
import {
  generateIngressServiceEntry,
  generateLocalEgressServiceEntry,
  generateSharedServiceEntry,
} from "./service-entry";
import { istioEgressGatewayNamespace } from "./istio-resources";
import { HostPortsProtocol, EgressResource } from "./types";
import { sharedEgressPkgId } from "./egress";

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
  it("should create a local egress ServiceEntry object", () => {
    const host = "example.com";
    const port = 80;
    const protocol = RemoteProtocol.HTTP;
    const namespace = "test-namespace";
    const packageName = "test-pkg";
    const generation = "1";
    const ownerReferences = [
      {
        apiVersion: "uds.dev/v1alpha1",
        kind: "Package",
        name: "test-pkg",
        uid: "f50120aa-2713-4502-9496-566b102b1174",
      },
    ];
    const hostPortsProtocol: HostPortsProtocol = {
      host,
      ports: [port],
      protocol,
    };

    const serviceEntry = generateLocalEgressServiceEntry(
      hostPortsProtocol,
      packageName,
      namespace,
      generation,
      ownerReferences,
    );

    expect(serviceEntry).toBeDefined();
    expect(serviceEntry.metadata?.name).toEqual("test-pkg-egress-http-80-example-com");
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
    expect(serviceEntry.metadata?.namespace).toEqual(istioEgressGatewayNamespace);
    expect(serviceEntry.metadata?.labels).toEqual({
      "uds/package": sharedEgressPkgId,
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
