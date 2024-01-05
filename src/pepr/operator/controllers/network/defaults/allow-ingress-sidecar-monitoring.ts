import { Direction } from "../../../crd";
import { generate } from "../generate";

export const allowIngressSidecarMonitoring = (namespace: string) =>
  generate(namespace, {
    direction: Direction.Ingress,
    remoteNamespaceLabels: {
      "kubernetes.io/metadata.name": "monitoring",
    },
    remotePodLabels: {
      app: "prometheus",
    },
    port: 15020,
  });
