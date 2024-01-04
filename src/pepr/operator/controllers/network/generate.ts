import { V1NetworkPolicyPeer, V1NetworkPolicyPort } from "@kubernetes/client-node";
import { K8s, Log, kind } from "pepr";

import { Allow, UDSPackage } from "../../crd";
import { RemoteGenerated } from "../../crd/generated/package-v1alpha1";

let apiServerPeers: V1NetworkPolicyPeer[];

export async function generate(
  namespace: string,
  pkg: UDSPackage,
  policy: Allow,
): Promise<kind.NetworkPolicy> {
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
  switch (policy.remoteGenerated) {
    // KubeAPI maps to the Kubernetes API server
    case RemoteGenerated.KubeAPI:
      peers = await generateKubeAPI();
      generated.metadata!.labels!["uds/generated"] = "kubeapi";
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
    const { endpoints } = await K8s(kind.EndpointSlice).InNamespace("default").Get("kubernetes");

    const peers = endpoints?.flatMap(e => e.addresses);

    // If the peers are found, cache and return them
    if (peers?.length) {
      apiServerPeers = peers.flatMap(ip => ({
        ipBlock: {
          cidr: `${ip}/32`,
        },
      }));

      return apiServerPeers;
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
