/**
 * Copyright 2024-2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { Direction } from "../../../crd";
import { RemoteProtocol } from "../../../crd/generated/package-v1alpha1";
import { generate } from "../generate";

export const allowEgressDNS = (namespace: string) => {
  return generate(namespace, {
    direction: Direction.Egress,
    description: "DNS lookup via CoreDNS",
    remoteNamespace: "kube-system",
    remoteSelector: {
      "k8s-app": "kube-dns",
    },
    port: 53,
    // DNS uses UDP/53 per RFC 1035; TCP/53 (large responses, zone transfers) is not allowed by default.
    remoteProtocol: RemoteProtocol.UDP,
  });
};
