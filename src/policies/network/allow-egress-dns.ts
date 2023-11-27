import { kind } from "pepr";

export function allowEgressDNS(ns: string): kind.NetworkPolicy {
  return {
    apiVersion: "networking.k8s.io/v1",
    kind: "NetworkPolicy",
    metadata: {
      name: "allow-egress-dns",
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
