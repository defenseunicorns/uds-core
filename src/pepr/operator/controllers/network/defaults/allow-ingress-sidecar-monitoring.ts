import { Direction } from "../../../crd";
import { generate } from "../generate";

export const allowIngressSidecarMonitoring = (namespace: string) =>
  generate(namespace, {
    direction: Direction.Ingress,
    description: "Sidecar monitoring",
    remoteNamespace: "monitoring",
    remotePodLabels: {
      app: "prometheus",
    },
    port: 15020,
  });
