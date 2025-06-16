/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { V1NetworkPolicyPeer } from "@kubernetes/client-node";
import { istioEgressGatewayNamespace } from "../../istio/istio-resources";

/** Matches a the egress gateway resource */
export const egressGateway: V1NetworkPolicyPeer = {
  namespaceSelector: {
    matchLabels: {
      "kubernetes.io/metadata.name": istioEgressGatewayNamespace,
    },
  },
  podSelector: {
    matchLabels: {
      app: "egressgateway",
    },
  },
};
