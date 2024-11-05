/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { V1NetworkPolicyPeer } from "@kubernetes/client-node";

/** Matches any pod in the namespace */
export const intraNamespace: V1NetworkPolicyPeer = {
  podSelector: {
    matchLabels: {},
  },
};
