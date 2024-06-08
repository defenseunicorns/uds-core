import { V1LabelSelector, V1NetworkPolicyPeer, V1NetworkPolicyPort } from "@kubernetes/client-node";
import { kind } from "pepr";

import { Allow, RemoteGenerated } from "../../crd";
import { anywhere } from "./generators/anywhere";
import { cloudMetadata } from "./generators/cloudMetadata";
import { intraNamespace } from "./generators/intraNamespace";
import { kubeAPI } from "./generators/kubeAPI";

export function generate(namespace: string, policy: Allow): kind.NetworkPolicy {
  // Generate a unique name for the NetworkPolicy
  const name = generateName(policy);

  // Create the NetworkPolicy
  const generated: kind.NetworkPolicy = {
    apiVersion: "networking.k8s.io/v1",
    kind: "NetworkPolicy",
    metadata: {
      name,
      namespace,
      labels: { ...policy.labels },
    },
    spec: {
      policyTypes: [policy.direction],
      podSelector: {
        matchLabels: policy.selector,
      },
    },
  };

  // Add the description if it exists to the annotations in case of truncation of the name
  if (policy.description) {
    generated.metadata!.annotations = {
      "uds/description": policy.description,
    };
  }

  // Create the remote (peer) to match against
  let peers: V1NetworkPolicyPeer[] = [];

  // Add the remoteNamespace if they exist
  if (policy.remoteNamespace !== undefined) {
    const namespaceSelector: V1LabelSelector = {};

    // Add the remoteNamespace to the namespaceSelector if it exists and is not "*", otherwise match all namespaces
    if (policy.remoteNamespace !== "" && policy.remoteNamespace !== "*") {
      namespaceSelector.matchLabels = {
        "kubernetes.io/metadata.name": policy.remoteNamespace,
      };
    }

    // Add the remoteNamespace to the peers
    peers.push({ namespaceSelector });
  }

  // Add the remoteSelector if they exist
  if (policy.remoteSelector) {
    peers.push({
      podSelector: {
        matchLabels: policy.remoteSelector,
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
        peers = kubeAPI();
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

/**
 * Generate a unique name for a NetworkPolicy based on the policy. Will use the description if it exists,
 * otherwise will use the direction, combination of remote properties and the port if it exists.
 *
 * @param policy the policy to generate the name for
 */
export function generateName(policy: Allow) {
  const baseName =
    // Use the description if it exists
    policy.description ||
    // Otherwise use the direction, and combination of remote properties
    [
      Object.values(policy.selector || ["all pods"]),
      policy.remoteGenerated || [
        policy.remoteNamespace,
        Object.values(policy.remoteSelector || ["all pods"]),
      ],
    ]
      // Flatten the array
      .flat(1)
      .join("-");

  // Add the port if it exists
  const generatedName = policy.port ? `${policy.port}-${baseName}` : baseName;

  return `${policy.direction}-${generatedName}`;
}
