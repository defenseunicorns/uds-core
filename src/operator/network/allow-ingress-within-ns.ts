import { kind } from "pepr";

export function allowIngressWithinNS(ns: string): kind.NetworkPolicy {
  return {
    apiVersion: "networking.k8s.io/v1",
    kind: "NetworkPolicy",
    metadata: {
      name: "allow-ingress-within-ns",
      namespace: ns,
    },
    spec: {
      podSelector: {},
      policyTypes: ["Ingress"],
      ingress: [
        {
          from: [
            {
              namespaceSelector: {},
            },
          ],
        },
      ],
    },
  };
}
