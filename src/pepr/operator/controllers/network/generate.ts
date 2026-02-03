/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { V1NetworkPolicyPeer, V1NetworkPolicyPort } from "@kubernetes/client-node";
import { kind } from "pepr";

import { Mode } from "../../crd/generated/package-v1alpha1.js";
import { Allow, RemoteGenerated } from "../../crd/index.js";
import { anywhere, anywhereInCluster } from "./generators/anywhere.js";
import { cloudMetadata } from "./generators/cloudMetadata.js";
import { egressGateway, egressWaypoint } from "./generators/egress.js";
import { intraNamespace } from "./generators/intraNamespace.js";
import { kubeAPI } from "./generators/kubeAPI.js";
import { kubeNodes } from "./generators/kubeNodes.js";
import { remoteCidr } from "./generators/remoteCidr.js";

function isWildcardNamespace(namespace: string) {
  return namespace === "" || namespace === "*";
}

function getPeers(policy: Allow, istioMode: Mode | undefined): V1NetworkPolicyPeer[] {
  let peers: V1NetworkPolicyPeer[] = [];

  if (policy.remoteGenerated) {
    switch (policy.remoteGenerated) {
      case RemoteGenerated.KubeAPI:
        peers = kubeAPI();
        break;

      case RemoteGenerated.KubeNodes:
        peers = kubeNodes();
        break;

      case RemoteGenerated.CloudMetadata:
        peers = cloudMetadata;
        break;

      case RemoteGenerated.IntraNamespace:
        peers = [intraNamespace];
        break;

      case RemoteGenerated.Anywhere:
        peers = [anywhere, anywhereInCluster];
        break;
    }
  } else if (policy.remoteNamespace !== undefined || policy.remoteSelector !== undefined) {
    const peer: V1NetworkPolicyPeer = {};

    if (policy.remoteNamespace !== undefined) {
      if (isWildcardNamespace(policy.remoteNamespace)) {
        peer.namespaceSelector = {};
      } else {
        peer.namespaceSelector = {
          matchLabels: { "kubernetes.io/metadata.name": policy.remoteNamespace },
        };
      }
    }

    if (policy.remoteSelector !== undefined) {
      peer.podSelector = {
        matchLabels: policy.remoteSelector,
      };
    }

    peers.push(peer);
  } else if (policy.remoteCidr !== undefined) {
    peers = [remoteCidr(policy.remoteCidr)];
  } else if (policy.remoteHost) {
    if (istioMode === Mode.Ambient) {
      peers = [egressWaypoint];
    } else {
      peers = [egressGateway];
    }
  }

  return peers;
}

export function generate(namespace: string, policy: Allow, istioMode?: Mode): kind.NetworkPolicy {
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

  // Add the generated policy label (used to track KubeAPI and KubeNodes policies)
  if (policy.remoteGenerated) {
    generated.metadata!.labels!["uds/generated"] = policy.remoteGenerated;
  }

  // Create the network policy peers
  const peers: V1NetworkPolicyPeer[] = getPeers(policy, istioMode);

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
 * Generates a unique name for the NetworkPolicy based on the policy.
 * Will use the description if it exists, otherwise it will use the
 * direction and combination of remote properties.
 *
 * @param policy The policy to generate a name for
 */
export function generateName(policy: Allow) {
  const name =
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

  return `${policy.direction}-${name}`;
}
