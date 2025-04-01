/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { describe, expect, it } from "@jest/globals";
import { generateDestinationRule, subsetName } from "./destination-rule";
import { sharedEgressPkgId } from "./egress";
import { istioEgressGatewayNamespace } from "./istio-resources";
import { EgressResource } from "./types";
import { RemoteProtocol } from "../../crd";

describe("test generate destination rule", () => {
  it("should create a destination rule object", () => {
    const egressResources: EgressResource = {
      packages: ["test-pkg1", "test-pkg2"],
      portProtocols: [
        { port: 443, protocol: RemoteProtocol.TLS },
      ],
    }
    const generation = 1;

    const destinationRule = generateDestinationRule(
      egressResources,
      1,
    );

    expect(destinationRule).toBeDefined();
    expect(destinationRule.metadata?.name).toEqual(`egressgateway-destination-rule`);
    expect(destinationRule.metadata?.namespace).toEqual(istioEgressGatewayNamespace);
    expect(destinationRule.metadata?.labels).toEqual({
      "uds/generation": generation.toString(),
      "uds/package": sharedEgressPkgId,
    });
    expect(destinationRule.spec?.host).toEqual(`egressgateway.${istioEgressGatewayNamespace}.svc.cluster.local`);
    expect(destinationRule.spec?.subsets).toBeDefined();
    expect(destinationRule.spec?.subsets?.[0].name).toEqual(subsetName);
  });
});