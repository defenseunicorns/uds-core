// SPDX-License-Identifier: AGPL-3.0-or-later OR Commercial
import { Direction } from "../../../crd";
import { generate } from "../generate";

export const allowIngressSidecarMonitoring = (namespace: string) =>
  generate(namespace, {
    direction: Direction.Ingress,
    description: "Sidecar monitoring",
    remoteNamespace: "monitoring",
    remoteSelector: {
      app: "prometheus",
    },
    port: 15020,
  });
