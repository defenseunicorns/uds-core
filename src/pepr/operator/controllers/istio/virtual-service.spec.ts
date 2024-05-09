import { describe, expect, it } from "@jest/globals";
import { UDSConfig } from "../../../config";
import { generateVirtualService } from "./virtual-service";
import { Expose, Gateway } from "../../crd";

describe("test generate virtual service", () => {
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

  it("should create a simple VirtualService object", () => {
    const expose: Expose = {
      host,
      port,
      service,
    };

    const payload = generateVirtualService(expose, namespace, pkgName, generation, ownerRefs);

    expect(payload).toBeDefined();
    expect(payload.metadata?.name).toEqual(
      `${pkgName}-${Gateway.Tenant}-${host}-${port}-${service}`,
    );
    expect(payload.metadata?.namespace).toEqual(namespace);

    expect(payload.spec?.hosts).toBeDefined();
    expect(payload.spec!.hosts![0]).toEqual(`${host}.${UDSConfig.domain}`);

    expect(payload.spec?.http).toBeDefined();
    expect(payload.spec!.http![0].route).toBeDefined();
    expect(payload.spec!.http![0].route![0].destination?.host).toEqual(
      `${service}.${namespace}.svc.cluster.local`,
    );
    expect(payload.spec!.http![0].route![0].destination?.port?.number).toEqual(port);

    expect(payload.spec?.gateways).toBeDefined();
    expect(payload.spec!.gateways![0]).toEqual(
      `istio-${Gateway.Tenant}-gateway/${Gateway.Tenant}-gateway`,
    );
  });

  it("should create an admin VirtualService object", () => {
    const gateway = Gateway.Admin;
    const expose: Expose = {
      gateway,
      host,
      port,
      service,
    };

    const payload = generateVirtualService(expose, namespace, pkgName, generation, ownerRefs);

    expect(payload).toBeDefined();
    expect(payload.spec?.hosts).toBeDefined();
    expect(payload.spec!.hosts![0]).toEqual(`${host}.admin.${UDSConfig.domain}`);
  });

  it("should create an advancedHttp VirtualService object", () => {
    const advancedHTTP = {
      directResponse: { status: 404 },
    };
    const expose: Expose = {
      host,
      port,
      service,
      advancedHTTP,
    };

    const payload = generateVirtualService(expose, namespace, pkgName, generation, ownerRefs);

    expect(payload).toBeDefined();
    expect(payload.spec?.http).toBeDefined();
    expect(payload.spec!.http![0].route).not.toBeDefined();
    expect(payload.spec!.http![0].directResponse?.status).toEqual(404);
  });

  it("should create a passthrough VirtualService object", () => {
    const gateway = Gateway.Passthrough;
    const expose: Expose = {
      gateway,
      host,
      port,
      service,
    };

    const payload = generateVirtualService(expose, namespace, pkgName, generation, ownerRefs);

    expect(payload).toBeDefined();
    expect(payload.spec?.tls).toBeDefined();
    expect(payload.spec!.tls![0].match).toBeDefined();
    expect(payload.spec!.tls![0].match![0].port).toEqual(443);
    expect(payload.spec!.tls![0].match![0].sniHosts![0]).toEqual(`${host}.${UDSConfig.domain}`);
    expect(payload.spec!.tls![0].route).toBeDefined();
    expect(payload.spec!.http![0].route![0].destination?.host).toEqual(
      `${service}.${namespace}.svc.cluster.local`,
    );
    expect(payload.spec!.http![0].route![0].destination?.port?.number).toEqual(port);
  });
});
