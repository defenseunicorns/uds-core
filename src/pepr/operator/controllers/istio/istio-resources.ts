/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { K8s } from "pepr";

import { Component, setupLogger } from "../../../logger";
import { IstioServiceEntry, IstioVirtualService, IstioSidecar, UDSPackage } from "../../crd";
import { RemoteProtocol } from "../../crd";
import { getOwnerRef, purgeOrphans } from "../utils";
import { generateIngressServiceEntry, generateEgressServiceEntry } from "./service-entry";
import { generateIngressVirtualService } from "./virtual-service";
import { generateEgressSidecar } from "./sidecar";
import { reconcileSharedEgressResources } from "./egress";
import { PackageAction } from "./types";

// configure subproject logger
export const log = setupLogger(Component.OPERATOR_ISTIO);

// Egress gateway variables
export const istioEgressGatewayNamespace = "istio-egress-gateway";
export const sharedResourcesAnnotationPrefix = "uds.dev/user";

/**
 * Creates a VirtualService and ServiceEntry for each exposed service in the package
 * and creates or merges Istio resources for allowing egress traffic to external services
 *
 * @param pkg
 * @param namespace
 */
export async function istioResources(pkg: UDSPackage, namespace: string) {
  const pkgName = pkg.metadata!.name!;
  // const pkgId = getPackageId(pkg);
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

  // Iterate over each allowed service
  for (const allow of allowList) {
    const remoteHost = allow.remoteHost;
    const remoteProtocol = allow.remoteProtocol ?? RemoteProtocol.TLS;
    const port = allow.port || 443;

    // Add package-related egress resources if remoteHost is defined
    if (remoteHost) {
      // Create Service Entry
      const serviceEntry = generateEgressServiceEntry(
        remoteHost,
        remoteProtocol,
        port,
        pkgName,
        namespace,
        generation,
        ownerRefs,
      );

      log.debug(serviceEntry, `Applying Service Entry ${serviceEntry.metadata?.name}`);

      // Apply the ServiceEntry and force overwrite any existing resource
      await K8s(IstioServiceEntry)
        .InNamespace(namespace)
        .Get(serviceEntry.metadata!.name!)
        .catch(async err => {
          if (err.status === 404) {
            await K8s(IstioServiceEntry).Apply(serviceEntry, { force: true });
          } else {
            log.error(`Failed to reconcile Service Entry ${serviceEntry.metadata?.name}: ${err}`);
          }
        });

      // Create Sidecar
      const sidecar = generateEgressSidecar(
        remoteHost,
        remoteProtocol,
        port,
        allow.selector,
        pkgName,
        namespace,
        generation,
        ownerRefs,
      );

      log.debug(sidecar, `Applying Sidecar ${sidecar.metadata?.name}`);

      // Apply the Sidecar and force overwrite any existing resource
      await K8s(IstioSidecar)
        .InNamespace(namespace)
        .Get(sidecar.metadata!.name!)
        .catch(async err => {
          if (err.status === 404) {
            await K8s(IstioSidecar).Apply(sidecar, { force: true });
          } else {
            log.error(`Failed to reconcile Sidecar ${sidecar.metadata?.name}: ${err}`);
          }
        });
    }
  }

  // Reconcile shared egress resources
  await reconcileSharedEgressResources(pkg, PackageAction.AddOrUpdate);

  // Purge any orphaned resources
  await purgeOrphans(generation, namespace, pkgName, IstioVirtualService, log);
  await purgeOrphans(generation, namespace, pkgName, IstioServiceEntry, log);
  await purgeOrphans(generation, namespace, pkgName, IstioSidecar, log);

  // Return the list of unique hostnames
  return [...hosts];
}

// Get the shared annotation key for the package
export function getSharedAnnotationKey(pkgId: string) {
  return `${sharedResourcesAnnotationPrefix}-${pkgId}`;
}

// Get the unique package ID
export function getPackageId(pkg: UDSPackage) {
  return `${pkg.metadata?.name}-${pkg.metadata?.namespace}`;
}
