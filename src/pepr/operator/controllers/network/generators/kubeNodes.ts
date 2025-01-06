/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { KubernetesListObject } from "@kubernetes/client-node";
import { V1NetworkPolicyPeer, V1NodeAddress } from "@kubernetes/client-node";
import { K8s, kind, R } from "pepr";

import { Component, setupLogger } from "../../../../logger";
import { RemoteGenerated } from "../../../crd";
import { anywhere } from "./anywhere";
import { UDSConfig } from "../../../../config";
import { retryWithDelay } from "../../utils";

const log = setupLogger(Component.OPERATOR_GENERATORS);

// Maintain a set of all node internal IPs
const nodeSet = new Set<string>();

/**
 * Initialize the node targets by fetching the current nodes in the cluster
 * and populating the nodeSet with their Internal IPs.
 */
export async function initAllNodesTarget() {
  // if a list of CIDRs is defined, use those
  if (UDSConfig.kubeNodeCidrs) {
    const nodeCidrs = UDSConfig.kubeNodeCidrs.split(",");
    for (const nodeCidr of nodeCidrs) {
      nodeSet.add(nodeCidr);
    }
    await updateKubeNodesNetworkPolicies();
    return;
  }

  try {
    const nodes = await retryWithDelay(fetchKubernetesNodes, log);
    nodeSet.clear();

    for (const node of nodes.items) {
      const ip = getNodeInternalIP(node);
      if (ip) nodeSet.add(ip);
    }
    await updateKubeNodesNetworkPolicies();
  } catch (err) {
    log.error("error fetching node IPs:", err);
  }
}

/**
 * Returns the egress CIDRs of all known nodes as network policy peers.
 * If none are known, defaults to 0.0.0.0/0 and logs a warning.
 */
export function kubeNodes(): V1NetworkPolicyPeer[] {
  const policies = buildNodePolicies([...nodeSet]);
  if (policies.length > 0) return policies;

  log.warn("Unable to get Node CIDRs, defaulting to 0.0.0.0/0");
  return [anywhere];
}

/**
 * When a node is created or updated, if it's Ready, add its IP to the set,
 * rebuild the policies, and update the NetworkPolicies.
 */
export async function updateKubeNodesFromCreateUpdate(node: kind.Node) {
  const ip = getNodeInternalIP(node);
  if (ip) nodeSet.add(ip);

  await updateKubeNodesNetworkPolicies();
}

/**
 * When a node is deleted, remove its IP from the set, rebuild the policies,
 * and update the NetworkPolicies.
 */
export async function updateKubeNodesFromDelete(node: kind.Node) {
  const ip = getNodeInternalIP(node);
  if (ip) nodeSet.delete(ip);

  await updateKubeNodesNetworkPolicies();
}

/**
 * Fetch all Kubernetes nodes.
 */
async function fetchKubernetesNodes(): Promise<KubernetesListObject<kind.Node>> {
  return K8s(kind.Node).Get();
}

/**
 * Update all NetworkPolicies labeled with uds/generated=KubeNodes to
 * reflect the given node CIDRs.
 */
export async function updateKubeNodesNetworkPolicies() {
  const newNodes = buildNodePolicies([...nodeSet]);
  const netPols = await K8s(kind.NetworkPolicy)
    .WithLabel("uds/generated", RemoteGenerated.KubeNodes)
    .Get();

  for (const netPol of netPols.items) {
    if (!netPol.spec) {
      log.warn(
        `KubeNodes NetworkPolicy ${netPol.metadata?.namespace}/${netPol.metadata?.name} is missing spec.`,
      );
      continue;
    }

    let updateRequired = false;
    if (netPol.spec.egress) {
      netPol.spec.egress[0] = netPol.spec.egress[0] || { to: [] };
      const oldNodes = netPol.spec.egress[0].to;
      if (!R.equals(oldNodes, newNodes)) {
        updateRequired = true;
        netPol.spec.egress[0].to = newNodes;
      }
    } else if (netPol.spec.ingress) {
      netPol.spec.ingress[0] = netPol.spec.ingress[0] || { from: [] };
      const oldNodes = netPol.spec.ingress[0].from;
      if (!R.equals(oldNodes, newNodes)) {
        updateRequired = true;
        netPol.spec.ingress[0].from = newNodes;
      }
    }

    // If the policy required a change, apply the new policy
    if (updateRequired) {
      if (netPol.metadata) {
        // Remove managed fields to prevent server-side apply errors
        netPol.metadata.managedFields = undefined;
      }

      log.debug(
        `Updating KubeNodes NetworkPolicy ${netPol.metadata?.namespace}/${netPol.metadata?.name} with new CIDRs.`,
      );

      try {
        await K8s(kind.NetworkPolicy).Apply(netPol, { force: true });
      } catch (err) {
        let message = err.data?.message || "Unknown error while applying KubeNode network policies";
        if (UDSConfig.kubeNodeCidrs) {
          message +=
            ", ensure that the KUBENODE_CIDRS override configured for the operator is correct.";
        }
        throw new Error(message);
      }
    }
  }
}

/**
 * Build V1NetworkPolicyPeer array from a list of node IPs.
 */
function buildNodePolicies(nodeIPs: string[]): V1NetworkPolicyPeer[] {
  return nodeIPs.map(ip => ({
    ipBlock: {
      cidr: format32cidr(ip),
    },
  }));
}

/**
 * Utility function conditionally format an IP as a 32-bit CIDR.
 */
function format32cidr(ip: string): string {
  // Check if the input already appears to have CIDR notation
  if (ip.includes("/")) {
    return ip;
  }
  // If not, append "/32"
  return `${ip}/32`;
}

/**
 * Utility function to get the InternalIP of a node.
 */
function getNodeInternalIP(node: kind.Node): string | undefined {
  return node.status?.addresses?.find((addr: V1NodeAddress) => addr.type === "InternalIP")?.address;
}
