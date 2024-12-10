/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { V1NetworkPolicyPeer, V1NodeCondition, V1NodeAddress } from "@kubernetes/client-node";
// import { K8s, kind, R } from "pepr";
import { kind } from "pepr";

import { Component, setupLogger } from "../../../../logger";
// import { RemoteGenerated } from "../../../crd";
import { anywhere } from "./anywhere";

// configure subproject logger
const log = setupLogger(Component.OPERATOR_GENERATORS);

// This is an in-memory cache of the API server CIDR
let apiServerPeers: V1NetworkPolicyPeer[];

/**
 * Initialize the API server CIDR by getting the EndpointSlice and Service for the API server
 */
export async function initAllNodesTarget() {
  log.info("======= init node IPs called ==========");
  // const slice = await K8s(kind.EndpointSlice).InNamespace("default").Get("kubernetes");
  // const svc = await K8s(kind.Service).InNamespace("default").Get("kubernetes");
  // console.log("test");
  // await updateAPIServerCIDR(slice, svc);
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
  log.info("Unable to get API server CIDR, defaulting to 0.0.0.0/0");
  return [anywhere];
}

/**
 * When the kubernetes EndpointSlice is created or updated, update the API server CIDR
 * @param slice The EndpointSlice for the API server
 */
export async function updateAllNodesTargetFromEvent(node: kind.Node) {
  log.info("======= init node IPs called ==========");
  try {
    log.debug(
      "Processing watch for node updates, getting k8s service for updating API server CIDR",
    );
    // const svc = await K8s(kind.Service).InNamespace("default").Get("kubernetes");
    await updateNodeTarget(node);
  } catch (err) {
    const msg = "Failed to update network policies from endpoint slice watch";
    log.error({ err }, msg);
  }
}

/**
 * Update the API server CIDR and update the NetworkPolicies
 *
 * @param slice The EndpointSlice for the API server
 * @param svc The Service for the API server
 */
// export async function updateAPIServerCIDR(slice: kind.EndpointSlice, svc: kind.Service) {
export async function updateNodeTarget(node: kind.Node) {
  log.info("======= update node IPs called ==========");
  log.info("=================");
  log.info("=================");
  const nodeName = node.metadata?.name;
  const conditions = node.status?.conditions;

  log.info(`Node: ${nodeName}`);
  conditions?.forEach((condition: V1NodeCondition) => {
    if (condition.type === "Ready") {
      log.info(`  Status: ${condition.status === "True" ? "Ready" : "Not Ready"}`);
    }
  });
  const addresses = node.status?.addresses;

  // Extract the IP address (typically "InternalIP")
  const internalIP = addresses?.find((addr: V1NodeAddress) => addr.type === "InternalIP")?.address;
  const externalIP = addresses?.find((addr: V1NodeAddress) => addr.type === "ExternalIP")?.address;

  log.info(`Node: ${nodeName}`);
  log.info(`  Internal IP: ${internalIP || "N/A"}`);
  log.info(`  External IP: ${externalIP || "N/A"}`);
  log.info("=================");
  // const { endpoints } = slice;
  // const k8sApiIP = svc.spec?.clusterIP;

  // // Flatten the endpoints into a list of IPs
  // const peers = endpoints?.flatMap(e => e.addresses);

  // if (k8sApiIP) {
  // 	peers?.push(k8sApiIP);
  // }

  // // If the peers are found, cache and process them
  // if (peers?.length) {
  // 	apiServerPeers = peers.flatMap(ip => ({
  // 		ipBlock: {
  // 			cidr: `${ip}/32`,
  // 		},
  // 	}));

  // 	// Get all the KubeAPI NetworkPolicies
  // 	const netPols = await K8s(kind.NetworkPolicy)
  // 		.WithLabel("uds.dev/generated", RemoteGenerated.KubeAPI)
  // 		.Get();

  // 	for (const netPol of netPols.items) {
  // 		// Get the old peers
  // 		const oldPeers = netPol.spec?.egress?.[0].to;

  // 		// Update the NetworkPolicy if the peers have changed
  // 		if (!R.equals(oldPeers, apiServerPeers)) {
  // 			// Note using the apiServerPeers variable here instead of the oldPeers variable
  // 			// in case another EndpointSlice is updated before this one
  // 			netPol.spec!.egress![0].to = apiServerPeers;

  // 			log.debug(`Updating ${netPol.metadata!.namespace}/${netPol.metadata!.name}`);
  // 			await K8s(kind.NetworkPolicy).Apply(netPol);
  // 		}
  // 	}
  // }
}
