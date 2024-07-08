import { K8s } from "pepr";

import { Component, setupLogger } from "../../../logger";
import { IstioServiceEntry, IstioVirtualService, UDSPackage } from "../../crd";
import { getOwnerRef } from "../utils";
import { generateServiceEntry } from "./service-entry";
import { generateVirtualService } from "./virtual-service";

// configure subproject logger
const log = setupLogger(Component.OPERATOR_ISTIO);

/**
 * Creates a VirtualService and ServiceEntry for each exposed service in the package
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
    const vsPayload = generateVirtualService(expose, namespace, pkgName, generation, ownerRefs);

    log.debug(vsPayload, `Applying VirtualService ${vsPayload.metadata?.name}`);

    // Apply the VirtualService and force overwrite any existing policy
    await K8s(IstioVirtualService).Apply(vsPayload, { force: true });

    vsPayload.spec!.hosts!.forEach(h => hosts.add(h));

    // Generate a ServiceEntry for this `expose` entry
    const sePayload = generateServiceEntry(expose, namespace, pkgName, generation, ownerRefs);

    // If we have already made a ServiceEntry with this name, skip (i.e. if advancedHTTP was used)
    if (serviceEntryNames.get(sePayload.metadata!.name!)) {
      continue;
    }

    log.debug(sePayload, `Applying ServiceEntry ${sePayload.metadata?.name}`);

    // Apply the ServiceEntry and force overwrite any existing policy
    await K8s(IstioServiceEntry).Apply(sePayload, { force: true });

    serviceEntryNames.set(sePayload.metadata!.name!, true);
  }

  // Get all related VirtualServices in the namespace
  const virtualServices = await K8s(IstioVirtualService)
    .InNamespace(namespace)
    .WithLabel("uds/package", pkgName)
    .Get();

  // Find any orphaned VirtualServices (not matching the current generation)
  const orphanedVS = virtualServices.items.filter(
    vs => vs.metadata?.labels?.["uds/generation"] !== generation,
  );

  // Delete any orphaned VirtualServices
  for (const vs of orphanedVS) {
    log.debug(vs, `Deleting orphaned VirtualService ${vs.metadata!.name}`);
    await K8s(IstioVirtualService).Delete(vs);
  }

  // Get all related ServiceEntries in the namespace
  const serviceEntries = await K8s(IstioServiceEntry)
    .InNamespace(namespace)
    .WithLabel("uds/package", pkgName)
    .Get();

  // Find any orphaned ServiceEntries (not matching the current generation)
  const orphanedSE = serviceEntries.items.filter(
    se => se.metadata?.labels?.["uds/generation"] !== generation,
  );

  // Delete any orphaned ServiceEntries
  for (const se of orphanedSE) {
    log.debug(se, `Deleting orphaned ServiceEntry ${se.metadata!.name}`);
    await K8s(IstioServiceEntry).Delete(se);
  }

  // Return the list of unique hostnames
  return [...hosts];
}
