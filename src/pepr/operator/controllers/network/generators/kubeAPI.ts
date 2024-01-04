import { V1NetworkPolicyPeer } from "@kubernetes/client-node";
import { K8s, Log, kind } from "pepr";

import { anywhere } from "./anywhere";

let apiServerPeers: V1NetworkPolicyPeer[];

/**
 * This generates a NetworkPolicyPeer that matches the API server endpoints.
 *
 * @returns A NetworkPolicyPeer that matches the API server endpoints
 */
export async function generateKubeAPI(): Promise<V1NetworkPolicyPeer[]> {
  // Return the cached value if it exists
  // @todo: evaluate if this ever changes with node autoscaling
  if (apiServerPeers) {
    return apiServerPeers;
  }

  try {
    // Read the API server endpoints from the cluster
    const { endpoints } = await K8s(kind.EndpointSlice).InNamespace("default").Get("kubernetes");

    // Flatten the endpoints into a list of IPs
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
  Log.warn("Unable to get API server CIRD, defaulting to 0.0.0.0/0");
  return [anywhere];
}
