/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { KubernetesListObject, V1NetworkPolicyPeer, V1NodeAddress } from "@kubernetes/client-node";
import { K8s, kind, R } from "pepr";

import { Component, setupLogger } from "../../../../logger";
import { RemoteGenerated } from "../../../crd";
import { AuthorizationPolicy } from "../../../crd/generated/istio/authorizationpolicy-v1beta1";
import { NetworkConfig } from "../../shared/network-config";
import { retryWithDelay } from "../../utils";
import { anywhere } from "./anywhere";

const log = setupLogger(Component.OPERATOR_GENERATORS);

// Maintain a set of all node internal IPs
const nodeSet = new Set<string>();

// Maintain a map of node names to their internal IPs
const nodeNameToIPMap = new Map<string, string>();

// Track whether AuthorizationPolicies are available yet (Pepr installs before Istio)
let authorizationPolicyExists = false;

/**
 * Initialize the node targets by fetching the current nodes in the cluster
 * and populating the nodeSet with their Internal IPs.
 *
 * @param networkConfig The network configuration containing CIDR settings
 */
export async function initAllNodesTarget(networkConfig: NetworkConfig) {
  if (process.env.PEPR_WATCH_MODE === "true" || process.env.PEPR_MODE === "dev") {
    // if a list of CIDRs is defined, use those
    if (networkConfig.kubeNodeCIDRs.length > 0) {
      for (const nodeCidr of networkConfig.kubeNodeCIDRs) {
        nodeSet.add(nodeCidr);
      }
      await updateKubeNodesNetworkPolicies(networkConfig);
      await updateKubeNodesAuthorizationPolicies();
      return;
    }

    try {
      const nodes = await retryWithDelay(fetchKubernetesNodes, log);
      nodeSet.clear();

      for (const node of nodes.items) {
        const ip = getNodeInternalIP(node);
        const nodeName = node.metadata!.name!;

        if (ip) {
          nodeSet.add(ip);
          nodeNameToIPMap.set(nodeName, ip);
        }
      }
      await updateKubeNodesNetworkPolicies(networkConfig);
      await updateKubeNodesAuthorizationPolicies();
    } catch (err) {
      log.error("error fetching node IPs:", err);
    }
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
 * When a node is created or updated, if it's Ready, add its IP to the nodeSet and nodeNameToIPMap,
 * rebuild the policies, and update the NetworkPolicies.
 */
export async function updateKubeNodesFromCreateUpdate(
  node: kind.Node,
  networkConfig: NetworkConfig,
) {
  const ip = getNodeInternalIP(node);
  const nodeName = node.metadata!.name!;

  if (ip) {
    const oldIP = nodeNameToIPMap.get(nodeName);

    nodeSet.add(ip);
    nodeNameToIPMap.set(nodeName, ip);

    // If the node's IP has changed, remove the old IP from the set
    if (oldIP && oldIP !== ip) {
      nodeSet.delete(oldIP);
    }
  }

  await updateKubeNodesNetworkPolicies(networkConfig);
  await updateKubeNodesAuthorizationPolicies();
}

/**
 * When a node is deleted, remove its IP from the set, rebuild the policies,
 * and update the NetworkPolicies.
 */
export async function updateKubeNodesFromDelete(node: kind.Node, networkConfig: NetworkConfig) {
  const ip = getNodeInternalIP(node);
  const nodeName = node.metadata!.name!;
  if (ip) {
    nodeSet.delete(ip);
    nodeNameToIPMap.delete(nodeName);
  }

  await updateKubeNodesNetworkPolicies(networkConfig);
  await updateKubeNodesAuthorizationPolicies();
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
 *
 * @param networkConfig The network configuration containing CIDR settings
 */
export async function updateKubeNodesNetworkPolicies(networkConfig: NetworkConfig) {
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
        if (networkConfig.kubeNodeCIDRs.length > 0) {
          message +=
            ", ensure that the KUBENODE_CIDRS override configured for the operator is correct.";
        }
        throw new Error(message);
      }
    }
  }
}

/**
 * Updates the AuthorizationPolicies for KubeNodes.
 *
 * This function rebuilds the current set of node peers from the in-memory node set,
 * extracts their CIDR strings, and then queries for all AuthorizationPolicies that are labeled
 * with "uds/generated" equal to RemoteGenerated.KubeNodes. For each matching policy, it checks
 * whether the current IP blocks in the policy's "from" source match the newly computed IP blocks.
 * If they differ, the policy is updated (with managedFields cleared to avoid server-side apply issues)
 * and then re-applied.
 *
 * @returns {Promise<void>} A promise that resolves once the update process is complete.
 */
export async function updateKubeNodesAuthorizationPolicies(): Promise<void> {
  // Build the current set of node peers from nodeSet.
  const newPeers = buildNodePolicies([...nodeSet]);
  // Extract CIDR strings from the new peers.
  const newIpBlocks = newPeers
    .map(peer => peer.ipBlock?.cidr)
    .filter((cidr): cidr is string => typeof cidr === "string");

  // Check if AuthorizationPolicy is available in the cluster
  if (!authorizationPolicyExists) {
    try {
      await K8s(kind.CustomResourceDefinition).Get("authorizationpolicies.security.istio.io");
      authorizationPolicyExists = true;
    } catch {
      log.warn(
        "AuthorizationPolicy CRD is not present in the cluster, skipping KubeNodes AuthorizationPolicy updates",
      );
      return;
    }
  }

  const authPols = await K8s(AuthorizationPolicy)
    .WithLabel("uds/generated", RemoteGenerated.KubeNodes)
    .Get();

  if (authPols.items.length > 0) {
    const summary = authPols.items
      .map(
        (pol: AuthorizationPolicy) =>
          `name: ${pol.metadata?.name}, namespace: ${pol.metadata?.namespace}`,
      )
      .join(" | ");
    log.trace(`Fetched ${authPols.items.length} AuthorizationPolicies: ${summary}`);
  }

  for (const pol of authPols.items) {
    // Ensure the policy has rules.
    if (!pol.spec || !pol.spec.rules || pol.spec.rules.length === 0) {
      log.warn(
        `AuthorizationPolicy ${pol.metadata?.namespace}/${pol.metadata?.name} is missing rules.`,
      );
      continue;
    }

    let updateRequired = false;
    const rule = pol.spec.rules[0];

    // Check if a "from" entry exists with ipBlocks.
    if (rule.from && rule.from.length > 0 && rule.from[0].source?.ipBlocks) {
      const oldIpBlocks = rule.from[0].source.ipBlocks;
      if (!R.equals(oldIpBlocks, newIpBlocks)) {
        rule.from[0].source.ipBlocks = newIpBlocks;
        updateRequired = true;
      }
    } else {
      // Otherwise, create a "from" entry.
      rule.from = [{ source: { ipBlocks: newIpBlocks } }];
      updateRequired = true;
    }

    if (updateRequired) {
      // Clear managedFields to avoid server-side apply issues.
      if (pol.metadata) {
        pol.metadata.managedFields = undefined;
      }
      try {
        await K8s(AuthorizationPolicy).Apply(pol, { force: true });
        log.debug(
          `Updated KubeNodes AuthorizationPolicy ${pol.metadata?.namespace}/${pol.metadata?.name}`,
        );
      } catch (err) {
        log.error(
          err,
          `Failed to update AuthorizationPolicy ${pol.metadata?.namespace}/${pol.metadata?.name}`,
        );
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
