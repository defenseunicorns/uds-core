/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { K8sGatewayFromType, K8sGateway } from "../../crd";
import { getSharedAnnotationKey } from "./istio-resources";
import { ambientEgressNamespace, sharedEgressPkgId } from "./egress-ambient";

export const waypointName = "egress-waypoint";

// Generate Waypoint for ambient egress
export function generateWaypoint(pkgs: Set<string>, generation: number) {
  // Add annotations from resource
  const annotations: Record<string, string> = {};
  for (const pkgId of pkgs) {
    annotations[`${getSharedAnnotationKey(pkgId)}`] = "user";
  }

  // Waypoint resource
  const waypoint: K8sGateway = {
    metadata: {
      name: waypointName,
      namespace: ambientEgressNamespace,
      annotations,
      labels: {
        "uds/package": sharedEgressPkgId,
        "uds/generation": generation.toString(),
      },
    },
    spec: {
      gatewayClassName: "istio-waypoint",
      listeners: [
        {
          name: "mesh",
          port: 15008,
          protocol: "HBONE",
          allowedRoutes: {
            namespaces: {
              from: K8sGatewayFromType.All,
            },
            kinds: [
              {
                group: "networking.istio.io",
                kind: "ServiceEntry",
              },
            ],
          },
        },
      ],
      infrastructure: {
        parametersRef: {
          group: "",
          kind: "ConfigMap",
          name: "egress-waypoint-config",
        },
      },
    },
  };

  return waypoint;
}
