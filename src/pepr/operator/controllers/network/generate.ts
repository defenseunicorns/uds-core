import { V1APIGroup, V1NetworkPolicyPeer, V1NetworkPolicyPort } from "@kubernetes/client-node";
import { K8s, Log, kind } from "pepr";

import { Allow, UDSPackage } from "../../crd";
import { RemoteGenerated } from "../../crd/generated/package-v1alpha1";

let apiServerPeers: V1NetworkPolicyPeer[];

export async function generate(
  namespace: string,
  pkg: UDSPackage,
  policy: Allow,
  idx: number,
): Promise<kind.NetworkPolicy> {
  const pkgName = pkg.metadata!.name!;
  const target = Object.values(policy.podLabels || ["all-pods"]).join("-");

  // Create a unique name for the NetworkPolicy based on the package name, index, direction, pod labels, and port
  const name = `allow-${policy.direction}-${target}-${pkgName}-${idx}`.toLowerCase();

  // Create the NetworkPolicy
  const generated: kind.NetworkPolicy = {
    apiVersion: "networking.k8s.io/v1",
    kind: "NetworkPolicy",
    metadata: {
      name,
      namespace,
      labels: {
        "uds/builder": "true",
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
  switch (policy.remoteGenerated) {
    // KubeAPI maps to the Kubernetes API server
    case RemoteGenerated.KubeAPI:
      peers = await generateKubeAPI();
      break;

    // IntraNamespace maps to the current namespace
    case RemoteGenerated.IntraNamespace:
      peers.push({
        podSelector: {
          matchLabels: {},
        },
      });
      break;
  }

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
      generated.spec!.ingress = [{ from: peers, ports }];
      break;

    case "Egress":
      generated.spec!.egress = [{ to: peers, ports }];
      break;
  }

  return generated;
}

async function generateKubeAPI(): Promise<V1NetworkPolicyPeer[]> {
  // Return the cached value if it exists
  // @todo: evaluate if this ever changes with node autoscaling
  if (apiServerPeers) {
    return apiServerPeers;
  }

  try {
    // Read the API server endpoints from the cluster
    const { serverAddressByClientCIDRs } = await K8s(V1APIGroup).Raw("/api");

    const peers = serverAddressByClientCIDRs?.flatMap(s => {
      // Parse the value to get the host
      const match = s.serverAddress.match(/^(?<host>[^:]+):(?<port>\d+)$/);

      // Throw an error if the host is not found
      if (!match?.groups?.host) {
        throw new Error(`Unable to parse serverAddress: ${s.serverAddress}`);
      }

      // Otherwise, add the ipBlock to the peers map
      return {
        ipBlock: {
          cidr: `${match.groups.host}/32`,
        },
      };
    });

    // If the peers are found, cache and return them
    if (peers?.length) {
      apiServerPeers = peers;
      return peers;
    }
  } catch (err) {
    Log.debug(err);
  }

  // Log a warning and default to 0.0.0.0/0 if the IP is not found
  Log.warn("Unable to get api-server-cidr, defaulting to 0.0.0.0/0");
  return [
    {
      ipBlock: { cidr: "0.0.0.0/0" },
    },
  ];
}
