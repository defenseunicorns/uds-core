import { V1NetworkPolicyPeer, V1NetworkPolicyPort } from "@kubernetes/client-node";
import { kind } from "pepr";

import { Allow } from "../../crd";
import { RemoteGenerated } from "../../crd/generated/package-v1alpha1";
import { anywhere } from "./generators/anywhere";
import { cloudMetadata } from "./generators/cloudMetadata";
import { intraNamespace } from "./generators/intraNamespace";
import { generateKubeAPI } from "./generators/kubeAPI";

export function generate(namespace: string, policy: Allow): kind.NetworkPolicy {
  const target = Object.values(policy.podLabels || ["all-pods"]).join("-");

  // Create a unique name for the NetworkPolicy based on the package name, index, direction, pod labels, and port
  const name = `${policy.direction}-${target}`.toLowerCase();

  // Create the NetworkPolicy
  const generated: kind.NetworkPolicy = {
    apiVersion: "networking.k8s.io/v1",
    kind: "NetworkPolicy",
    metadata: {
      name,
      namespace,
      labels: {
        "uds/generator": "true",
        ...policy.labels,
      },
    },
    spec: {
      policyTypes: [policy.direction],
      podSelector: {
        matchLabels: policy.podLabels,
      },
    },
  };

  // Create the remote (peer) to match against
  let peers: V1NetworkPolicyPeer[] = [];

  // Add the remoteNamespaceLabels if they exist
  if (policy.remoteNamespaceLabels) {
    peers.push({
      namespaceSelector: {
        matchLabels: policy.remoteNamespaceLabels,
      },
    });
  }

  // Add the remotePodLabels if they exist
  if (policy.remotePodLabels) {
    peers.push({
      podSelector: {
        matchLabels: policy.remotePodLabels,
      },
    });
  }

  // Check if remoteGenerated is set
  if (policy.remoteGenerated) {
    // Add the remoteGenerated label
    generated.metadata!.labels!["uds/generated"] = policy.remoteGenerated;

    // Check if remoteGenerated is set
    switch (policy.remoteGenerated) {
      case RemoteGenerated.KubeAPI:
        peers = generateKubeAPI();
        break;

      case RemoteGenerated.CloudMetadata:
        peers = cloudMetadata;
        break;

      case RemoteGenerated.IntraNamespace:
        peers.push(intraNamespace);
        break;

      case RemoteGenerated.Anywhere:
        peers = [anywhere];
        break;
    }
  }

  // Define the ports to allow from the ports property
  const ports: V1NetworkPolicyPort[] = (policy.ports ?? []).map(port => ({ port }));

  // Add the individual port if it exists
  if (policy.port) {
    ports.push({
      port: policy.port,
    });
  }

  // Add the ingress or egress rule
  switch (policy.direction) {
    case "Ingress":
      generated.spec!.ingress = [{ from: peers, ports }];
      break;

    case "Egress":
      generated.spec!.egress = [{ to: peers, ports }];
      break;
  }

  return generated;
}
