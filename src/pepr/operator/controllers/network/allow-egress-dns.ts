import { kind } from "pepr";

export function allowEgressDNS(namespace: string): kind.NetworkPolicy {
  return {
    apiVersion: "networking.k8s.io/v1",
    kind: "NetworkPolicy",
    metadata: {
      name: `egress-dns`,
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
          ports: [
            {
              port: 53,
              protocol: "UDP",
            },
          ],
        },
      ],
    },
  };
}
