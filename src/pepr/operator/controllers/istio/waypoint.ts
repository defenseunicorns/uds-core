/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { IstioWaypoint, WaypointFromType } from "../../crd";
import { istioEgressWaypointNamespace, getSharedAnnotationKey } from "./istio-resources";
import { sharedEgressPkgId } from "./egress";

export const waypointName = "egress-waypoint";

// Generate Waypoint for ambient egress
export function generateWaypoint(pkgs: string[], generation: number) {
  // Add annotations from resource
  const annotations: Record<string, string> = {};
  for (const pkgId of pkgs) {
    annotations[`${getSharedAnnotationKey(pkgId)}`] = "user";
  }

  // Waypoint resource
  const waypoint: IstioWaypoint = {
    metadata: {
      name: waypointName,
      namespace: istioEgressWaypointNamespace,
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
              from: WaypointFromType.All,
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
    },
    // TODO: if env.EGRESS_WAYPOINT_CONFIG
    // infrastructure:
    //   parametersRef:
    //     group: ""
    //     kind: ConfigMap
    //     name: gw-options
    // },
  };

  return waypoint;
}
