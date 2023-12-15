import { kind } from "pepr";

export function defaultDenyAll(ns: string): kind.NetworkPolicy {
  return {
    apiVersion: "networking.k8s.io/v1",
    kind: "NetworkPolicy",
    metadata: {
      name: "default-deny-all",
      namespace: ns,
    },
    spec: {
      podSelector: {},
      policyTypes: ["Ingress", "Egress"],
      ingress: [],
      egress: [],
    },
  };
}
