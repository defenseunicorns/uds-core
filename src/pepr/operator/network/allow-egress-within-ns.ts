import { kind } from "pepr";

export function allowEgressWithinNS(namespace: string): kind.NetworkPolicy {
  return {
    apiVersion: "networking.k8s.io/v1",
    kind: "NetworkPolicy",
    metadata: {
      name: "allow-egress-within-ns",
      namespace,
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
