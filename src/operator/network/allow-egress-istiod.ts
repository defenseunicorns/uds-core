import { kind } from "pepr";

export function allowEgressIstiod(namespace: string): kind.NetworkPolicy {
  return {
    apiVersion: "networking.k8s.io/v1",
    kind: "NetworkPolicy",
    metadata: {
      name: "allow-egress-istiod",
      namespace,
    },
    spec: {
      podSelector: {},
      policyTypes: ["Egress"],
      egress: [
        {
          to: [
            {
              namespaceSelector: {
                matchLabels: {
                  "kubernetes.io/metadata.name": "istio-system",
                },
              },
              podSelector: {
                matchLabels: {
                  istio: "pilot",
                },
              },
            },
          ],
          ports: [
            {
              port: 15012,
            },
          ],
        },
      ],
    },
  };
}
