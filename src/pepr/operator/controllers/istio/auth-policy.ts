/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { V1OwnerReference } from "@kubernetes/client-node";
import { IstioAuthorizationPolicy, IstioAction } from "../../crd";
import { sanitizeResourceName } from "../utils";

// Generate Authorization Policy for ambient egress
export function generateAuthorizationPolicy(
  host: string,
  pkgName: string,
  namespace: string,
  generation: string,
  ownerRefs: V1OwnerReference[],
  serviceEntryName: string,
  serviceAccount: string,
) {
  const authPolicy: IstioAuthorizationPolicy = {
    metadata: {
      name: generateAuthorizationPolicyName(host, serviceAccount),
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
              source: {
                serviceAccounts: [serviceAccount],
              },
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

function generateAuthorizationPolicyName(host: string, serviceAccount: string) {
  return sanitizeResourceName(`${host}-${serviceAccount}-egress`);
}
