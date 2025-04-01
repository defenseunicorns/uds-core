/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { describe, expect, it } from "@jest/globals";
import { generateEgressSidecar } from "./sidecar";
import { IstioOutboundTrafficPolicyMode, RemoteProtocol } from "../../crd";

describe("test generate sidecar", () => {
  it("should create a sidecar object", () => {
    const host = "example.com";
    const protocol = RemoteProtocol.HTTP;
    const port = 80;
    const labels = { app: "test" };
    const packageName = "test-pkg";
    const namespace = "test-namespace";
    const generation = "1";
    const ownerReferences = [
      {
        apiVersion: "uds.dev/v1alpha1",
        kind: "Package",
        name: "test-pkg",
        uid: "f50120aa-2713-4502-9496-566b102b1174",
      },
    ];

    const sidecar = generateEgressSidecar(
      host,
      protocol,
      port,
      labels,
      packageName,
      namespace,
      generation,
      ownerReferences,
    );

    expect(sidecar).toBeDefined();
    expect(sidecar.metadata?.name).toEqual(`test-pkg-egress-http-80-example-com`);
    expect(sidecar.metadata?.namespace).toEqual(namespace);
    expect(sidecar.metadata?.labels).toEqual({
      "uds/package": packageName,
      "uds/generation": generation,
    });
    expect(sidecar.metadata?.ownerReferences).toBeDefined();
    expect(sidecar.spec?.outboundTrafficPolicy).toEqual({
      mode: IstioOutboundTrafficPolicyMode.RegistryOnly,
    });
    expect(sidecar.spec?.workloadSelector).toEqual({
      labels: labels,
    });
  });
});
