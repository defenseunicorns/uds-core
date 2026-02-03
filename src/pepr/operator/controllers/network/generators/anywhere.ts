/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { V1NetworkPolicyPeer } from "@kubernetes/client-node";
import { META_IP } from "./cloudMetadata.js";

/** Matches any endpoint EXCEPT the Cloud Meta endpoint */
export const anywhere: V1NetworkPolicyPeer = {
  ipBlock: {
    cidr: "0.0.0.0/0",
    except: [META_IP],
  },
};

/** Matches any endpoint in cluster
 * This is primarily to support Cilium where IP based policies do not match/allow anything in-cluster
 * Ref: https://github.com/defenseunicorns/uds-core/issues/871 and https://github.com/cilium/cilium/blob/v1.16.2/Documentation/network/kubernetes/policy.rst#networkpolicy
 */
export const anywhereInCluster: V1NetworkPolicyPeer = {
  namespaceSelector: {},
};
