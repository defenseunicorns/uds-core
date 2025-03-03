/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */


import { IstioServiceEntry, IstioVirtualService, UDSPackage } from "../../crd";
import { getOwnerRef, purgeOrphans } from "../utils";
import { Component, setupLogger } from "../../../logger";
// TODO: generate DestinationRule crd, IstioServiceEntry, IstioVirtualService

// configure subproject logger
const log = setupLogger(Component.OPERATOR_ISTIO);

/**
 * Creates a Gateway, VirtualService, ServiceEntry, Destination Rule for each allowed 
 * remote host in the package
 *
 * @param pkg
 * @param namespace
 */
export async function egressResources(pkg: UDSPackage, namespace: string) {
  const pkgName = pkg.metadata!.name!;
  const generation = (pkg.metadata?.generation ?? 0).toString();
  const ownerRefs = getOwnerRef(pkg);

  // Get the list of exposed services
  const allowList = pkg.spec?.network?.allow ?? [];

  // Create a Set of allowed remote hosts (to maintain uniqueness)
  const remoteHosts = new Set<string>();

  // Track which ServiceEntries we've created
  const serviceEntryNames: Map<string, boolean> = new Map();

  // Iterate over each allowed service
  for (const allow of allowList) {
    // Create Gateway

    // Create Service Entry

    // Create Destination Rule

    // Create Virtual Service
  }

  await purgeOrphans(generation, namespace, pkgName, IstioVirtualService, log);
  await purgeOrphans(generation, namespace, pkgName, IstioServiceEntry, log);

  // Return the list of unique hostnames
  return [...remoteHosts];
}