import { kind } from "pepr";

export function allowEgressWithinNS(ns: string): kind.NetworkPolicy {
  return {
    apiVersion: "networking.k8s.io/v1",
    kind: "NetworkPolicy",
    metadata: {
      name: "allow-egress-within-ns",
      namespace: ns,
    },
    spec: {
      podSelector: {},
      policyTypes: ["Egress"],
      egress: [
        {
          to: [
            {
              namespaceSelector: {},
            },
          ],
        },
      ],
    },
  };
}
