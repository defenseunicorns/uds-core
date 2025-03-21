/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { K8s } from "pepr";

import { Component, setupLogger } from "../../../logger";
import { IstioServiceEntry, IstioVirtualService, UDSPackage } from "../../crd";
import { RemoteProtocol } from "../../crd/generated/package-v1alpha1";
import { getOwnerRef, purgeOrphans } from "../utils";
import { createOrPatchEgressGateway } from "./gateway";
import { generateIngressServiceEntry } from "./service-entry";
import { generateIngressVirtualService } from "./virtual-service";

// configure subproject logger
export const log = setupLogger(Component.OPERATOR_ISTIO);

// Constants for egress gateway
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
  const pkgId = getPackageId(pkg);
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

    // Add egress resources if remoteHost is defined
    if (remoteHost) {
      // Get unique shared resource identifier
      const sharedResourceId = getSharedResourceId(remoteHost);

      // Reconcile with existing egress gateway
      await createOrPatchEgressGateway(sharedResourceId, pkgId, remoteHost, remoteProtocol, port);

      // Create Destination Rule
      // Create Virtual Service
      // Create Service Entry
      // Create Sidecar
    }
  }

  await purgeOrphans(generation, namespace, pkgName, IstioVirtualService, log);
  await purgeOrphans(generation, namespace, pkgName, IstioServiceEntry, log);

  // Return the list of unique hostnames
  return [...hosts];
}

// Get shared resource ID - converted host to lowercase and replace invalid characters with '-'
export function getSharedResourceId(host: string) {
  return host.toLowerCase().replace(/[^a-z0-9-]/g, "-");
}

// Get the unique package ID
export function getPackageId(pkg: UDSPackage) {
  return `${pkg.metadata?.name}-${pkg.metadata?.namespace}`;
}
