/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { Direction } from "../../../crd/index.js";
import { generate } from "../generate.js";

export const allowEgressDNS = (namespace: string) => {
  const netPol = generate(namespace, {
    direction: Direction.Egress,
    description: "DNS lookup via CoreDNS",
    remoteNamespace: "kube-system",
    remoteSelector: {
      "k8s-app": "kube-dns",
    },
    port: 53,
  });

  // Override the generated policy to use UDP instead of TCP
  netPol.spec!.egress![0].ports![0].protocol = "UDP";

  return netPol;
};
