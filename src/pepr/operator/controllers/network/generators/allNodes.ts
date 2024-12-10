/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { KubernetesListObject } from "@kubernetes/client-node";
import { V1NetworkPolicyPeer, V1NodeCondition, V1NodeAddress } from "@kubernetes/client-node";
// import { K8s, kind, R } from "pepr";
import { K8s, kind } from "pepr";

import { Component, setupLogger } from "../../../../logger";
// import { RemoteGenerated } from "../../../crd";
import { anywhere } from "./anywhere";

// configure subproject logger
const log = setupLogger(Component.OPERATOR_GENERATORS);

// This is an in-memory cache of the API server CIDR
let nodeInternalIPs: V1NetworkPolicyPeer[];
// let nodeInternalIPs: string[] = [];

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
export async function updateAllNodesTargetFromDelete(node: kind.Node) {
	log.info("======= update node DELETE IPs called ==========");
	const nodeName = node.metadata?.name;

	log.info(`Node: ${nodeName}`);
	await rebuildIps();
	log.info("=================");
}

export async function rebuildIps() {
	log.info("================= trying to rebuild ips ================");
	try {
		const nodes = await fetchKubernetesNodes();
		nodeInternalIPs = [];
		// Iterate through the nodes and extract their IP addresses
		nodes.items.forEach((node: kind.Node) => {
			// const nodeName = node.metadata?.name;
			const addresses = node.status?.addresses;

			// Extract the IP address (typically "InternalIP")
			const internalIP = addresses?.find(
				(addr: V1NodeAddress) => addr.type === "InternalIP",
			)?.address;

			if (internalIP) {
				nodeInternalIPs.push(internalIP);
			}
		});
	} catch (err) {
		log.error("Error fetching node IPs:", err);
	}
	log.info(`All Nodes:`);
	log.info(`  Internal IPs: ${nodeInternalIPs || "N/A"}`);
	log.info("=================");
}

/**
 * Update the API server CIDR and update the NetworkPolicies
 *
 * @param slice The EndpointSlice for the API server
 * @param svc The Service for the API server
 */
// export async function updateAPIServerCIDR(slice: kind.EndpointSlice, svc: kind.Service) {
export async function updateNodeTarget(node: kind.Node) {
	const nodeName = node.metadata?.name;
	const conditions = node.status?.conditions;

	log.info(`Node: ${nodeName}`);
	conditions?.forEach((condition: V1NodeCondition) => {
		log.info(`  Condition Type: ${condition.type}`);
		log.info(`  Condition Status: ${condition.status}`);
		if (condition.type === "Ready") {
			log.info(`  Status: ${condition.status === "True" ? "Ready" : "Not Ready"}`);
		}
	});
	await rebuildIps();
}

/**
 * Fetches the Kubernetes Nodes.
 *
 * @returns {Promise<KubernetesListObject<kind.Node>>} - The Node list object.
 */
async function fetchKubernetesNodes(): Promise<KubernetesListObject<kind.Node>> {
	return K8s(kind.Node).Get();
}
