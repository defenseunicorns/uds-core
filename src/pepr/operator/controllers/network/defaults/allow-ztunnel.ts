import { Direction } from "../../../crd";
import { generate } from "../generate";

export const allowIngressZtunnel = (namespace: string) =>
  generate(namespace, {
    direction: Direction.Ingress,
    description: "Ztunnel",
    remoteNamespace: "*",
    port: 15008,
  });

export const allowEgressZtunnel = (namespace: string) =>
  generate(namespace, {
    direction: Direction.Egress,
    description: "Ztunnel",
    remoteNamespace: "*",
    port: 15008,
  });
