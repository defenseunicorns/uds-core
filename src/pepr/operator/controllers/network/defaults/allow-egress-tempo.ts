import { Direction } from "../../../crd";
import { generate } from "../generate";

export const allowEgressTempo = (namespace: string) =>
  generate(namespace, {
    direction: Direction.Egress,
    description: "Tempo",
    remoteNamespace: "tempo",
    remotePodLabels: {
      "app.kubernetes.io/name": "tempo",
    },
    port: 9411,
  });
