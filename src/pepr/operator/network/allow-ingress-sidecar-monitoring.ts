import { kind } from "pepr";

export function allowIngressSidecarMonitoring(namespace: string): kind.NetworkPolicy {
  return {
    apiVersion: "networking.k8s.io/v1",
    kind: "NetworkPolicy",
    metadata: {
      name: "allow-ingress-sidecar-monitoring",
      namespace,
    },
    spec: {
      podSelector: {},
      policyTypes: ["Ingress"],
      ingress: [
        {
          from: [
            {
              namespaceSelector: {
                matchLabels: {
                  "kubernetes.io/metadata.name": "monitoring",
                },
              },
              podSelector: {
                matchLabels: {
                  app: "prometheus",
                },
              },
            },
          ],
          ports: [
            {
              protocol: "TCP",
              port: 15020,
            },
          ],
        },
      ],
    },
  };
}
