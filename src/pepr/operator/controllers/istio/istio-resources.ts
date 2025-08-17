/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { K8s } from "pepr";

import { Component, setupLogger } from "../../../logger";
import { IstioServiceEntry, IstioSidecar, IstioVirtualService, UDSPackage } from "../../crd";
import { getOwnerRef, purgeOrphans, validateNamespace, getIstioStateFromPackage } from "../utils";
import { IstioState } from "./namespace";
import {
  createHostResourceMap,
  egressRequestedFromNetwork,
  reconcileSharedEgressResources,
} from "./egress";
import { createAmbientWorkloadEgressResources, ambientEgressNamespace } from "./egress-ambient";
import { validateEgressGateway, createSidecarWorkloadEgressResources } from "./egress-sidecar";
import { generateIngressServiceEntry } from "./service-entry";
import { PackageAction } from "./types";
import { generateIngressVirtualService } from "./virtual-service";

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

  // Reconcile any egress requested
  await istioEgressResources(pkg, namespace);

  // Purge any orphaned resources
  await purgeOrphans(generation, namespace, pkgName, IstioVirtualService, log);
  await purgeOrphans(generation, namespace, pkgName, IstioServiceEntry, log); // for ingress and egress
  await purgeOrphans(generation, namespace, pkgName, IstioSidecar, log); // for egress only

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
export async function istioEgressResources(pkg: UDSPackage, namespace: string) {
  // Get package data
  const istioState = getIstioStateFromPackage(pkg);
  const pkgId = getPackageId(pkg);
  const pkgName = pkg.metadata!.name!;
  const generation = (pkg.metadata?.generation ?? 0).toString();
  const ownerRefs = getOwnerRef(pkg);

  // Get the map of host resources as egress endpoints
  const hostResourceMap = createHostResourceMap(pkg);

  // Get the list of allowed egress services
  const allowList = egressRequestedFromNetwork(pkg.spec?.network?.allow ?? []);

  // Add needed service entries and sidecars if egress is requested
  if (hostResourceMap) {
    if (istioState === IstioState.Ambient) {
      // Validate existing egress waypoint namespace
      try {
        await validateNamespace(ambientEgressNamespace);
      } catch (e) {
        let errText = `Unable to get the egress waypoint namespace ${ambientEgressNamespace}.`;
        if (e?.status == 404) {
          errText = `The '${ambientEgressNamespace}' namespace was not found. Ensure the 'istio-egress-waypoint' component is deployed and try again.`;
        }
        log.error(errText);
        throw new Error(errText);
      }

      // For ambient workloads
      await createAmbientWorkloadEgressResources(
        hostResourceMap,
        allowList,
        pkgName,
        namespace,
        generation,
        ownerRefs,
      );
    } else {
      // Validate existing egress gateway namespace and service
      await validateEgressGateway(hostResourceMap);

      // Create sidecar and service entry resources
      await createSidecarWorkloadEgressResources(
        hostResourceMap,
        allowList,
        pkgName,
        namespace,
        generation,
        ownerRefs,
      );
    }
  }

  // Reconcile shared egress resources
  try {
    await reconcileSharedEgressResources(
      hostResourceMap,
      pkgId,
      PackageAction.AddOrUpdate,
      istioState,
    );
  } catch (e) {
    log.error(`Failed to reconcile shared egress resources for package ${pkgId}`, e);
    throw e;
  }
}

// Get the shared annotation key for the package
export function getSharedAnnotationKey(pkgId: string) {
  return `uds.dev/user-${pkgId}`;
}

// Get the unique package ID
export function getPackageId(pkg: UDSPackage) {
  return `${pkg.metadata?.name}-${pkg.metadata?.namespace}`;
}
