/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { Direction } from "../../../crd";
import { NetworkProtocol } from "../../../crd/generated/package-v1alpha1";
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
    networkProtocol: NetworkProtocol.UDP,
  });
};
