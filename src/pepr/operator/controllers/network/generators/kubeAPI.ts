import { V1NetworkPolicyPeer } from "@kubernetes/client-node";
import { K8s, Log, R, kind } from "pepr";

import { RemoteGenerated } from "../../../crd";
import { anywhere } from "./anywhere";

// This is an in-memory cache of the API server CIDR
let apiServerPeers: V1NetworkPolicyPeer[];

/**
 * Initialize the API server CIDR by getting the EndpointSlice for the API server
 */
export async function initAPIServerCIDR() {
  const slice = await K8s(kind.EndpointSlice).InNamespace("default").Get("kubernetes");
  await updateAPIServerCIDR(slice);
}

/**
 * Get the API server CIDR
 * @returns The API server CIDR
 */
export function kubeAPI() {
  // If the API server peers are already cached, return them
  if (apiServerPeers) {
    return apiServerPeers;
  }

  // Otherwise, log a warning and default to 0.0.0.0/0 until the EndpointSlice is updated
  Log.warn("Unable to get API server CIDR, defaulting to 0.0.0.0/0");
  return [anywhere];
}

/**
 * Update the API server CIDR and update the NetworkPolicies
 *
 * @param slice The EndpointSlice for the API server
 */
export async function updateAPIServerCIDR(slice: kind.EndpointSlice) {
  const { endpoints } = slice;

  // Flatten the endpoints into a list of IPs
  const peers = endpoints?.flatMap(e => e.addresses);

  // If the peers are found, cache and process them
  if (peers?.length) {
    apiServerPeers = peers.flatMap(ip => ({
      ipBlock: {
        cidr: `${ip}/32`,
      },
    }));

    // Get all the KubeAPI NetworkPolicies
    const netPols = await K8s(kind.NetworkPolicy)
      .WithLabel("uds.dev/generated", RemoteGenerated.KubeAPI)
      .Get();

    for (const netPol of netPols.items) {
      // Get the old peers
      const oldPeers = netPol.spec?.egress?.[0].to;

      // Update the NetworkPolicy if the peers have changed
      if (!R.equals(oldPeers, apiServerPeers)) {
        // Note using the apiServerPeers variable here instead of the oldPeers variable
        // in case another EndpointSlice is updated before this one
        netPol.spec!.egress![0].to = apiServerPeers;

        Log.debug(`Updating ${netPol.metadata!.namespace}/${netPol.metadata!.name}`);
        await K8s(kind.NetworkPolicy).Apply(netPol);
      }
    }
  }
}
