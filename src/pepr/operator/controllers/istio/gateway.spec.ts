/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { describe, expect, it } from "@jest/globals";
import { generateEgressGateway } from "./gateway";
import { EgressResource } from "./types";
import { RemoteProtocol, IstioTLSMode } from "../../crd";

describe("test generate egress gateway", () => {
  it("should create an http gateway object", () => {
    const host = "example.com";
    const resource: EgressResource = {
      packages: ["test-pkg1", "test-pkg2"],
      portProtocols: [{ port: 80, protocol: RemoteProtocol.HTTP }],
    };
    const generation = 1;

    const gateway = generateEgressGateway(host, resource, generation);

    expect(gateway).toBeDefined();
    expect(gateway.metadata?.name).toEqual("gateway-example-com");
    expect(gateway.metadata?.namespace).toEqual("istio-egress-gateway");
    expect(gateway.metadata?.labels).toEqual({
      "uds/generation": generation.toString(),
      "uds/package": "shared-egress-resource",
    });
    expect(gateway.metadata?.annotations).toEqual({
      "uds.dev/user-test-pkg1": "user",
      "uds.dev/user-test-pkg2": "user",
    });
    expect(gateway.spec?.servers).toBeDefined();
    expect(gateway.spec?.servers?.[0].hosts).toEqual([host]);
    expect(gateway.spec?.servers?.[0].port?.number).toEqual(80);
    expect(gateway.spec?.servers?.[0].port?.protocol).toEqual(RemoteProtocol.HTTP);
    expect(gateway.spec?.servers?.[0].tls?.mode).toEqual(IstioTLSMode.Passthrough);
  });
});