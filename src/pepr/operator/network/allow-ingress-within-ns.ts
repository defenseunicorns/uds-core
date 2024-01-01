import { kind } from "pepr";

export function allowIngressWithinNS(namespace: string): kind.NetworkPolicy {
  return {
    apiVersion: "networking.k8s.io/v1",
    kind: "NetworkPolicy",
    metadata: {
      name: "allow-ingress-within-ns",
      namespace,
    },
    spec: {
      podSelector: {},
      policyTypes: ["Ingress"],
    },
  };
}
