/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { DestinationRule } from "../../crd/generated/istio/destinationrule-v1";
import {
  getSharedAnnotationKey,
  istioEgressGatewayNamespace as namespace,
} from "./istio-resources";
import { sharedEgressPkgId } from "./egress";
import { EgressResource } from "./types";

export const subsetName = "egressgateway-subset";

/**
 * Create the egress destination rule resource
 *
 * @param resource
 * @param generation
 */
export function generateDestinationRule(resource: EgressResource, generation: number) {
  const name = "egressgateway-destination-rule";

  // Add annotations from resource
  const annotations: Record<string, string> = {};
  for (const pkgId of resource.packages) {
    annotations[`${getSharedAnnotationKey(pkgId)}`] = "user";
  }

  const destinationRule: DestinationRule = {
    metadata: {
      name,
      namespace,
      annotations,
      labels: {
        "uds/generation": generation.toString(),
        "uds/package": sharedEgressPkgId,
      },
    },
    spec: {
      host: `egressgateway.${namespace}.svc.cluster.local`,
      subsets: [
        {
          name: subsetName,
        },
      ],
    },
  };

  return destinationRule;
}
