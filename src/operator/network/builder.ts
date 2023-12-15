import { kind } from "pepr";
import { V1NetworkPolicyPeer, V1NetworkPolicyPort } from "@kubernetes/client-node";

import { Allow, UDSPackage } from "../crd";

export function builder(namespace: string, pkg: UDSPackage, policy: Allow): kind.NetworkPolicy {
  const pkgName = pkg.metadata!.name!;
  const name = `${pkgName}-${policy.name}`;

  // Create the NetworkPolicy
  const generated: kind.NetworkPolicy = {
    apiVersion: "networking.k8s.io/v1",
    kind: "NetworkPolicy",
    metadata: {
      name,
      namespace,
      labels: {
        "uds/package": pkgName,
        ...policy.labels,
      },
    },
    spec: {
      policyTypes: [policy.direction],
      podSelector: policy.podSelector,
    },
  };

  // Create the remote (peer)  to match against
  const peer: V1NetworkPolicyPeer = {
    namespaceSelector: policy.remoteNamespaceSelector,
    podSelector: policy.remotePodSelector,
  };

  // Create the port  to match against
  const ports: V1NetworkPolicyPort[] = [
    {
      port: policy.port,
      protocol: policy.protocol,
    },
  ];

  // Add the ingress or egress rule
  switch (policy.direction) {
    case "Ingress":
      generated.spec!.ingress = [{ from: [peer], ports }];
      break;

    case "Egress":
      generated.spec!.egress = [{ to: [peer], ports }];
      break;
  }

  return generated;
}
