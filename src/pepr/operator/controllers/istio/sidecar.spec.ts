/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { describe, expect, it } from "vitest";
import { IstioOutboundTrafficPolicyMode } from "../../crd/index.js";
import { ownerRefsMock } from "./defaultTestMocks.js";
import { generateEgressSidecar } from "./sidecar.js";

describe("test generate sidecar", () => {
  const packageName = "test-pkg";
  const namespace = "test-namespace";
  const generation = "1";

  it("should create a sidecar object", () => {
    const selector = { app: "test" };

    const sidecar = generateEgressSidecar(
      selector,
      packageName,
      namespace,
      generation,
      ownerRefsMock,
    );

    expect(sidecar).toBeDefined();
    expect(sidecar.metadata?.name).toEqual(`test-pkg-egress-app-test`);
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
      labels: selector,
    });
  });

  it("should create a sidecar object with no selector", () => {
    const selector = undefined;

    const sidecar = generateEgressSidecar(
      selector,
      packageName,
      namespace,
      generation,
      ownerRefsMock,
    );

    expect(sidecar).toBeDefined();
    expect(sidecar.metadata?.name).toEqual(`test-pkg-egress-default`);
    expect(sidecar.metadata?.namespace).toEqual(namespace);
    expect(sidecar.metadata?.labels).toEqual({
      "uds/package": packageName,
      "uds/generation": generation,
    });
    expect(sidecar.metadata?.ownerReferences).toBeDefined();
    expect(sidecar.spec?.outboundTrafficPolicy).toEqual({
      mode: IstioOutboundTrafficPolicyMode.RegistryOnly,
    });
    expect(sidecar.spec?.workloadSelector).not.toBeDefined();
  });
});
