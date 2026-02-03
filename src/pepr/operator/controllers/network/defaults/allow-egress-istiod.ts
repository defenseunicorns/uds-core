/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { Direction } from "../../../crd/index.js";
import { generate } from "../generate.js";

export const allowEgressIstiod = (
  namespace: string,
  clientId?: string,
  podSelector?: Record<string, string>,
) => {
  const policy = {
    direction: Direction.Egress,
    description: clientId ? `Istiod communication for ${clientId}` : "Istiod communication",
    remoteNamespace: "istio-system",
    remoteSelector: {
      istio: "pilot",
    },
    port: 15012,
    // Add the pod selector if provided
    ...(podSelector && { selector: podSelector }),
  };

  return generate(namespace, policy);
};
