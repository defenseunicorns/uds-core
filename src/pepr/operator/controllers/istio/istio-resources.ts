/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { K8s, kind } from "pepr";

import { V1OwnerReference } from "@kubernetes/client-node";
import { Component, setupLogger } from "../../../logger";
import { IstioServiceEntry, IstioSidecar, IstioVirtualService, UDSPackage, Allow } from "../../crd";
import { getOwnerRef, purgeOrphans } from "../utils";
import {
  createHostResourceMap,
  egressRequestedFromNetwork,
  reconcileSharedEgressResources,
} from "./egress";
import { generateIngressServiceEntry, generateLocalEgressServiceEntry } from "./service-entry";
import { generateEgressSidecar } from "./sidecar";
import { HostResourceMap, PackageAction } from "./types";
import { generateIngressVirtualService } from "./virtual-service";

// configure subproject logger
export const log = setupLogger(Component.OPERATOR_ISTIO);

// Egress gateway namespace
export const istioEgressGatewayNamespace = "istio-egress-gateway";

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

  // Get the list of allowed services
  const allowList = pkg.spec?.network?.allow ?? [];

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
  await istioEgressResources(
    createHostResourceMap(pkg),
    allowList,
    getPackageId(pkg),
    pkgName,
    namespace,
    generation,
    ownerRefs,
  );

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
 * @param hostResourceMap
 * @param pkg
 * @param pkgName
 * @param namespace
 * @param generation
 * @param ownerRefs
 */
export async function istioEgressResources(
  hostResourceMap: HostResourceMap | undefined,
  allowList: Allow[],
  pkgId: string,
  pkgName: string,
  namespace: string,
  generation: string,
  ownerRefs: V1OwnerReference[],
) {
  // Error if egress gateway is NOT enabled in the cluster and we have egress resources
  await K8s(kind.Namespace)
    .Get(istioEgressGatewayNamespace)
    .catch(e => {
      if (hostResourceMap) {
        log.error(
          `Egress gateway is not enabled in the cluster. Please enable the egress gateway and retry.`,
        );
        throw e;
      }
    });

  // Add needed service entries and sidecars if egress is requested
  if (hostResourceMap) {
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
      );

      log.debug(serviceEntry, `Applying Service Entry ${serviceEntry.metadata?.name}`);

      // Apply the ServiceEntry and force overwrite any existing resource
      await K8s(IstioServiceEntry).Apply(serviceEntry, { force: true });
    }

    // Add sidecar for each egress allow
    const egressRequested = egressRequestedFromNetwork(allowList);

    for (const allow of egressRequested) {
      // Create Sidecar
      const sidecar = generateEgressSidecar(
        allow.selector,
        pkgName,
        namespace,
        generation,
        ownerRefs,
      );

      log.debug(sidecar, `Applying Sidecar ${sidecar.metadata?.name}`);

      // Apply the Sidecar and force overwrite any existing resource
      await K8s(IstioSidecar).Apply(sidecar, { force: true });
    }
  }

  // Reconcile shared egress resources
  await reconcileSharedEgressResources(hostResourceMap, pkgId, PackageAction.AddOrUpdate);
}

// Get the shared annotation key for the package
export function getSharedAnnotationKey(pkgId: string) {
  return `uds.dev/user-${pkgId}`;
}

// Get the unique package ID
export function getPackageId(pkg: UDSPackage) {
  return `${pkg.metadata?.name}-${pkg.metadata?.namespace}`;
}
