/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { V1OwnerReference } from "@kubernetes/client-node";
import { IstioAction, IstioAuthorizationPolicy } from "../../crd";
import { sanitizeResourceName } from "../utils";

// Generate Authorization Policy for ambient egress
export function generateAmbientEgressAuthorizationPolicy(
  host: string,
  pkgName: string,
  namespace: string,
  generation: string,
  ownerRefs: V1OwnerReference[],
  serviceEntryName: string,
  serviceAccount: string | undefined,
) {
  const source = serviceAccount
    ? { principals: [`cluster.local/ns/${namespace}/sa/${serviceAccount}`] }
    : { namespaces: [`${namespace}`] };

  const authPolicy: IstioAuthorizationPolicy = {
    metadata: {
      name: generateAmbientEgressAuthorizationPolicyName(host, serviceAccount),
      namespace,
      labels: {
        "uds/package": pkgName,
        "uds/generation": generation,
      },
      // Use the CR as the owner ref for each AuthorizationPolicy
      ownerReferences: ownerRefs,
    },
    spec: {
      action: IstioAction.Allow,
      rules: [
        {
          from: [
            {
              source,
            },
          ],
        },
      ],
      // ServiceEntry is target to gate egress to host
      targetRef: {
        group: "networking.istio.io",
        kind: "ServiceEntry",
        name: serviceEntryName,
      },
    },
  };

  return authPolicy;
}

export function generateAmbientEgressAuthorizationPolicyName(
  host: string,
  serviceAccount: string | undefined,
) {
  return serviceAccount
    ? sanitizeResourceName(`${host}-${serviceAccount}-egress`)
    : sanitizeResourceName(`${host}-egress`);
}
