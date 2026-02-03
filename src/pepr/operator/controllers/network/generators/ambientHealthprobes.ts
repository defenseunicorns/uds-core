/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { Direction } from "../../../crd/index.js";
import { generate } from "../generate.js";

// See https://istio.io/latest/docs/ambient/usage/networkpolicy/#ambient-health-probes-and-kubernetes-networkpolicy
export const allowAmbientHealthprobes = (namespace: string) =>
  generate(namespace, {
    direction: Direction.Ingress,
    description: "Ambient Healthprobes",
    remoteCidr: "169.254.7.127/32",
  });
