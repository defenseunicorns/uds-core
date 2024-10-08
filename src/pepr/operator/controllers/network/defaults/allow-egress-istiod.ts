// SPDX-License-Identifier: AGPL-3.0-or-later OR Commercial
import { Direction } from "../../../crd";
import { generate } from "../generate";

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
