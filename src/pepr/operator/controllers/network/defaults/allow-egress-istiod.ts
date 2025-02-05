/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { Direction } from "../../../crd";
import { generate } from "../generate-net-policy";

export const allowEgressIstiod = (namespace: string) =>
  generate(namespace, {
    direction: Direction.Egress,
    description: "Istiod communication",
    remoteNamespace: "istio-system",
    remoteSelector: {
      istio: "pilot",
    },
    port: 15012,
  });
