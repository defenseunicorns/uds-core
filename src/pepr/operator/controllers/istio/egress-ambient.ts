/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */
import { V1OwnerReference } from "@kubernetes/client-node";
import { K8s } from "pepr";
import { Allow, IstioAuthorizationPolicy, IstioServiceEntry, K8sGateway } from "../../crd";
import { purgeOrphans } from "../utils";
import { generateAuthorizationPolicy } from "./auth-policy";
import { getHostPortsProtocol } from "./egress";
import { log } from "./istio-resources";
import { generateLocalEgressSEName, generateLocalEgressServiceEntry } from "./service-entry";
import { HostResourceMap } from "./types";
import { createEgressWaypointGateway } from "./ambient-waypoint";
import { IstioState } from "./namespace";

export const ambientEgressNamespace = "istio-egress-waypoint";
export const sharedEgressPkgId = "shared-ambient-egress-resource";

// Apply the ambient egress resources
export async function applyAmbientEgressResources(packageList: Set<string>, generation: number) {
  // If no packages using ambient egress, don't create the waypoint
  if (packageList.size === 0) {
    return;
  }

  // Generate the waypoint payload
  const waypoint = createEgressWaypointGateway(packageList, generation);

  // Apply waypoint
  log.debug(waypoint, `Applying Waypoint ${waypoint.metadata?.name}`);

  // Apply the Waypoint and force overwrite any existing resource
  await K8s(K8sGateway).Apply(waypoint, { force: true });
}

// Purge any orphaned ambient egress resources
export async function purgeAmbientEgressResources(generation: string) {
  try {
    await purgeOrphans(generation, ambientEgressNamespace, sharedEgressPkgId, K8sGateway, log);
  } catch (e) {
    const errText = `Failed to purge orphaned ambient egress resources`;
    log.error(`Failed to purge orphaned ambient egress resources`, e);
    throw errText;
  }
}

// Create package owned ambient egress resources
export async function createAmbientWorkloadEgressResources(
  hostResourceMap: HostResourceMap,
  egressRequested: Allow[],
  pkgName: string,
  namespace: string,
  generation: string,
  ownerRefs: V1OwnerReference[],
) {
  // Add service entry for each defined host
  for (const host of Object.keys(hostResourceMap)) {
    // Create Service Entry
    const serviceEntry = generateLocalEgressServiceEntry(
      host,
      hostResourceMap[host],
      pkgName,
      namespace,
      generation,
      ownerRefs,
      IstioState.Ambient,
    );

    log.debug(serviceEntry, `Applying Service Entry ${serviceEntry.metadata?.name}`);

    // Apply the ServiceEntry and force overwrite any existing resource
    await K8s(IstioServiceEntry).Apply(serviceEntry, { force: true });
  }

  // Create Authorization Policy for service entry, use specified serviceAccount or use "default" if no serviceAccount specified
  for (const allow of egressRequested) {
    const serviceAccount = allow.serviceAccount ?? "default";
    const hostPortsProtocol = getHostPortsProtocol(allow);
    if (!hostPortsProtocol) {
      continue;
    }
    const { host, ports, protocol } = hostPortsProtocol;
    const portsProtocol = ports.map(port => ({ port, protocol }));

    // Create Authorization Policy
    const authPolicy = generateAuthorizationPolicy(
      host,
      pkgName,
      namespace,
      generation,
      ownerRefs,
      generateLocalEgressSEName(pkgName, portsProtocol, host),
      serviceAccount,
    );

    log.debug(authPolicy, `Applying Authorization Policy ${authPolicy.metadata?.name}`);

    // Apply the AuthorizationPolicy and force overwrite any existing resource
    await K8s(IstioAuthorizationPolicy).Apply(authPolicy, { force: true });
  }
}
