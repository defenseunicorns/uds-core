/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { V1NetworkPolicyPeer } from "@kubernetes/client-node";

/** Matches a specific custom cidr without any exclusions */
export function remoteCidr(cidr: string): V1NetworkPolicyPeer {
  return {
    ipBlock: {
      cidr,
    },
  };
}
