/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { V1NetworkPolicyPeer } from "@kubernetes/client-node";
import { sidecarEgressNamespace } from "../../istio/egress-sidecar.js";
import { ambientEgressNamespace } from "../../istio/istio-resources.js";

/* Matches the egress gateway resource */
export const egressGateway: V1NetworkPolicyPeer = {
  namespaceSelector: {
    matchLabels: {
      "kubernetes.io/metadata.name": sidecarEgressNamespace,
    },
  },
  podSelector: {
    matchLabels: {
      app: "egressgateway",
    },
  },
};

/* Matches the egress waypoint resource */
export const egressWaypoint: V1NetworkPolicyPeer = {
  namespaceSelector: {
    matchLabels: {
      "kubernetes.io/metadata.name": ambientEgressNamespace,
    },
  },
  podSelector: {
    matchLabels: {
      "gateway.networking.k8s.io/gateway-name": "egress-waypoint",
    },
  },
};
