import { describe, expect, it } from "@jest/globals";
import { UDSConfig } from "../../../config";
import { generateServiceEntry } from "./service-entry";
import { Expose, Gateway, IstioLocation, IstioResolution } from "../../crd";

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

    const payload = generateServiceEntry(expose, namespace, pkgName, generation, ownerRefs);

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
