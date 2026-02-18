/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { K8s } from "pepr";

import { Component, setupLogger } from "../../../logger";
import { IstioServiceEntry, IstioSidecar, IstioVirtualService, UDSPackage } from "../../crd";
import { getOwnerRef, purgeOrphans, retryWithDelay } from "../utils";
import { generateIngressServiceEntry } from "./service-entry";
import { generateIngressVirtualService } from "./virtual-service";

// Central Ambient egress identifiers:
// - ambientEgressNamespace: namespace where shared Ambient egress resources live
// - sharedEgressPkgId: label value used to group and purge UDS-managed Ambient
//   egress resources by generation during reconciliation
export const ambientEgressNamespace = "istio-egress-ambient";
export const sharedEgressPkgId = "shared-ambient-egress-resource";

// configure subproject logger
export const log = setupLogger(Component.OPERATOR_ISTIO);

/**
 * Creates a VirtualService and ServiceEntry for each exposed service in the package
 * and creates or merges Istio resources for allowing egress traffic to external services
 *
 * @param pkg
 * @param namespace
 */
export async function istioResources(pkg: UDSPackage, namespace: string) {
  const pkgName = pkg.metadata!.name!;
  const generation = (pkg.metadata?.generation ?? 0).toString();
  const ownerRefs = getOwnerRef(pkg);

  // Get the list of exposed services
  const exposeList = pkg.spec?.network?.expose ?? [];

  // Create a Set of processed hosts (to maintain uniqueness)
  const hosts = new Set<string>();

  // Track which ServiceEntries we've created
  const serviceEntryNames: Map<string, boolean> = new Map();

  // Iterate over each exposed service
  for (const expose of exposeList) {
    // Generate a VirtualService for this `expose` entry
    const vsPayload = generateIngressVirtualService(
      expose,
      namespace,
      pkgName,
      generation,
      ownerRefs,
    );

    log.debug(vsPayload, `Applying VirtualService ${vsPayload.metadata?.name}`);

    // Apply the VirtualService and force overwrite any existing policy
    await K8s(IstioVirtualService).Apply(vsPayload, { force: true });

    vsPayload.spec!.hosts!.forEach(h => hosts.add(h));

    // Generate a ServiceEntry for this `expose` entry
    const sePayload = generateIngressServiceEntry(
      expose,
      namespace,
      pkgName,
      generation,
      ownerRefs,
    );

    // If we have already made a ServiceEntry with this name, skip (i.e. if advancedHTTP was used)
    if (serviceEntryNames.get(sePayload.metadata!.name!)) {
      continue;
    }

    log.debug(sePayload, `Applying ServiceEntry ${sePayload.metadata?.name}`);

    // Apply the ServiceEntry and force overwrite any existing policy
    await K8s(IstioServiceEntry).Apply(sePayload, { force: true });

    serviceEntryNames.set(sePayload.metadata!.name!, true);
  }

  // Purge any orphaned resources
  await retryWithDelay(async function purgeOrphanedVirtualServices() {
    return purgeOrphans(generation, namespace, pkgName, IstioVirtualService, log);
  }, log);
  await retryWithDelay(async function purgeOrphanedServiceEntries() {
    return purgeOrphans(generation, namespace, pkgName, IstioServiceEntry, log);
  }, log); // for ingress and egress
  await retryWithDelay(async function purgeOrphanedSidecars() {
    return purgeOrphans(generation, namespace, pkgName, IstioSidecar, log);
  }, log); // for egress only

  // Return the list of unique hostnames
  return [...hosts];
}

/**
 * Creates a ServiceEntry and Sidecar resource for egress traffic and reconciles
 * shared egress resources
 *
 * @param pkg
 * @param namespace
 */

// Get the shared annotation key for the package
export function getSharedAnnotationKey(pkgId: string) {
  return `uds.dev/user-${pkgId}`;
}

// Get the unique package ID
export function getPackageId(pkg: UDSPackage) {
  return `${pkg.metadata?.name}-${pkg.metadata?.namespace}`;
}
