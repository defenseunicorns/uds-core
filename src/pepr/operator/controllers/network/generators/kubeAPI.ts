/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { V1NetworkPolicyPeer } from "@kubernetes/client-node";
import { K8s, kind, R } from "pepr";

import { UDSConfig } from "../../../../config";
import { Component, setupLogger } from "../../../../logger";
import { RemoteGenerated } from "../../../crd";
import { retryWithDelay } from "../../utils";
import { anywhere } from "./anywhere";

// configure subproject logger
const log = setupLogger(Component.OPERATOR_GENERATORS);

// This is an in-memory cache of the API server CIDR
let apiServerPeers: V1NetworkPolicyPeer[];

/**
 * Initialize the API server CIDR.
 *
 * This function checks if a static CIDR is defined in the configuration.
 * If a static CIDR exists, it skips the EndpointSlice lookup and uses the static value.
 * Otherwise, it fetches the EndpointSlice and updates the CIDR dynamically.
 */
export async function initAPIServerCIDR() {
  try {
    const svc = await retryWithDelay(fetchKubernetesService, log);

    // If static CIDR is defined, pass it directly
    if (UDSConfig.kubeApiCidr) {
      log.info(
        `Static CIDR (${UDSConfig.kubeApiCidr}) is defined for KubeAPI, skipping EndpointSlice lookup.`,
      );
      await updateAPIServerCIDR(svc, UDSConfig.kubeApiCidr); // Pass static CIDR
    } else {
      const slice = await retryWithDelay(fetchKubernetesEndpointSlice, log);
      await updateAPIServerCIDR(svc, slice);
    }
  } catch (error) {
    log.error("Failed to initialize API Server CIDR for KubeAPI generated network policies", {
      err: JSON.stringify(error),
    });
  }
}

/**
 * Get the API server CIDR.
 *
 * @returns {V1NetworkPolicyPeer[]} The cached API server CIDR if available; otherwise, defaults to `0.0.0.0/0`.
 */
export function kubeAPI(): V1NetworkPolicyPeer[] {
  // If the API server peers are already cached, return them
  if (apiServerPeers) {
    return apiServerPeers;
  }

  // Otherwise, log a warning and default to 0.0.0.0/0 until the EndpointSlice is updated
  log.warn("Unable to get API server CIDR, defaulting to 0.0.0.0/0");
  return [anywhere];
}

/**
 * When the Kubernetes EndpointSlice is created or updated, update the API server CIDR.
 *
 * @param {kind.EndpointSlice} slice - The EndpointSlice object for the API server.
 */
export async function updateAPIServerCIDRFromEndpointSlice(slice: kind.EndpointSlice) {
  try {
    log.debug(
      "Processing watch for endpointslices, getting k8s service for updating API server CIDR",
    );
    const svc = await retryWithDelay(fetchKubernetesService, log);
    await updateAPIServerCIDR(svc, slice);
  } catch (err) {
    const msg = "Failed to update network policies from endpoint slice watch";
    log.error({ err }, msg);
  }
}

/**
 * When the Kubernetes Service is created or updated, update the API server CIDR.
 *
 * If a static CIDR is defined, it skips fetching the EndpointSlice and uses the static value.
 *
 * @param {kind.Service} svc - The Service object for the API server.
 */
export async function updateAPIServerCIDRFromService(svc: kind.Service) {
  try {
    if (UDSConfig.kubeApiCidr) {
      log.debug("Processing watch for api service, using configured API CIDR for endpoints");
      await updateAPIServerCIDR(svc, UDSConfig.kubeApiCidr);
    } else {
      log.debug(
        "Processing watch for api service, getting endpoint slices for updating API server CIDR",
      );
      const slice = await retryWithDelay(fetchKubernetesEndpointSlice, log);
      await updateAPIServerCIDR(svc, slice);
    }
  } catch (err) {
    const msg = "Failed to update network policies from API service watch";
    log.error({ err }, msg);
  }
}

/**
 * Update the API server CIDR and apply it to the NetworkPolicies.
 *
 * @param {kind.Service} svc - The Service object representing the Kubernetes API server.
 * @param {kind.EndpointSlice | string} slice - Either the EndpointSlice for dynamic CIDR generation or a static CIDR string.
 */
export async function updateAPIServerCIDR(svc: kind.Service, slice: kind.EndpointSlice | string) {
  const k8sApiIP = svc.spec?.clusterIP;

  let peers: string[] = [];

  // Handle static CIDR or dynamic EndpointSlice
  if (typeof slice === "string") {
    peers.push(slice);
  } else {
    const { endpoints } = slice;
    peers = Array.isArray(endpoints)
      ? endpoints.flatMap(e => {
          if (!Array.isArray(e?.addresses) || e.addresses.length === 0) {
            return []; // No addresses, skip this endpoint
          }
          return e.addresses.map(addr => `${addr}/32`); // Add /32 to each address
        })
      : [];
  }

  // Add the clusterIP from the service
  if (k8sApiIP) {
    peers.push(`${k8sApiIP}/32`);
  }

  // Convert peers into NetworkPolicyPeer objects
  if (peers.length) {
    apiServerPeers = peers.flatMap(cidr => ({
      ipBlock: {
        cidr: cidr,
      },
    }));

    // Update NetworkPolicies
    await updateKubeAPINetworkPolicies(apiServerPeers);
  } else {
    log.warn("No peers found for the API server CIDR update.");
  }
}

/**
 * Update NetworkPolicies with new API server peers.
 *
 * @param {V1NetworkPolicyPeer[]} newPeers - The updated list of peers to apply to the NetworkPolicies.
 */
export async function updateKubeAPINetworkPolicies(newPeers: V1NetworkPolicyPeer[]) {
  const netPols = await K8s(kind.NetworkPolicy)
    .WithLabel("uds/generated", RemoteGenerated.KubeAPI)
    .Get();

  for (const netPol of netPols.items) {
    // Safety check for network policy spec existence
    if (!netPol.spec) {
      log.warn(
        `KubeAPI NetworkPolicy ${netPol.metadata!.namespace}/${netPol.metadata!.name} is missing spec.`,
      );
      continue;
    }

    let updateRequired = false;
    // Handle egress policies
    if (netPol.spec.egress) {
      if (!netPol.spec.egress[0]) {
        netPol.spec.egress[0] = { to: [] };
      }
      const oldPeers = netPol.spec.egress[0].to;
      if (!R.equals(oldPeers, newPeers)) {
        updateRequired = true;
        netPol.spec.egress[0].to = newPeers;
      }
      // Handle ingress policies
    } else if (netPol.spec.ingress) {
      if (!netPol.spec.ingress[0]) {
        netPol.spec.ingress[0] = { from: [] };
      }
      const oldPeers = netPol.spec.ingress[0].from;
      if (!R.equals(oldPeers, newPeers)) {
        updateRequired = true;
        netPol.spec.ingress[0].from = newPeers;
      }
    }

    // If the policy required a change, apply the new policy
    if (updateRequired) {
      if (netPol.metadata) {
        // Remove managed fields to prevent errors on server side apply
        netPol.metadata.managedFields = undefined;
      }

      log.debug(
        `Updating KubeAPI NetworkPolicy ${netPol.metadata!.namespace}/${netPol.metadata!.name} with new CIDRs.`,
      );
      try {
        await K8s(kind.NetworkPolicy).Apply(netPol, { force: true });
      } catch (err) {
        let message = err.data?.message || "Unknown error while applying KubeAPI network policies";
        if (UDSConfig.kubeApiCidr) {
          message +=
            ", ensure that the KUBEAPI_CIDR override configured for the operator is correct.";
        }
        throw new Error(message);
      }
    }
  }
}

/**
 * Fetches the Kubernetes Service object for the API server.
 *
 * @returns {Promise<kind.Service>} - The Service object.
 */
async function fetchKubernetesService(): Promise<kind.Service> {
  return K8s(kind.Service).InNamespace("default").Get("kubernetes");
}

/**
 * Fetches the Kubernetes EndpointSlice object for the API server.
 *
 * @returns {Promise<kind.EndpointSlice>} - The EndpointSlice object.
 */
async function fetchKubernetesEndpointSlice(): Promise<kind.EndpointSlice> {
  return K8s(kind.EndpointSlice).InNamespace("default").Get("kubernetes");
}
