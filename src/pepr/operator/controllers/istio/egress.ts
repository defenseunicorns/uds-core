/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */
import { Allow, RemoteProtocol, UDSPackage } from "../../crd";
import { Mode } from "../../crd/generated/package-v1alpha1";
import { getOwnerRef, validateNamespace } from "../utils";
import {
  ambientEgressNamespace,
  applyAmbientEgressResources,
  purgeAmbientEgressResources,
} from "./egress-ambient";
import {
  applySidecarEgressResources,
  purgeSidecarEgressResources,
  sidecarEgressNamespace,
  createSidecarWorkloadEgressResources,
  validateEgressGateway,
} from "./egress-sidecar";
import { log } from "./istio-resources";
import {
  EgressResource,
  EgressResourceMap,
  HostPortsProtocol,
  HostResourceMap,
  PackageAction,
  PackageHostMap,
} from "./types";

// Cache for in-memory sidecar-only shared egress resources from package CRs
export const inMemoryPackageMap: PackageHostMap = {};

// Lock to prevent concurrent updates to the inMemoryPackageMap
let sidecarLock = false;
// eslint-disable-next-line prefer-const
let sidecarLockQueue: (() => void)[] = [];

// Cache for in-memory ambient egress resources from package CRs
export const inMemoryAmbientPackageMap: PackageHostMap = {};
let ambientLock = false;
// eslint-disable-next-line prefer-const
let ambientLockQueue: (() => void)[] = [];

// Mutexes to prevent concurrent reconciliation operations for each mode
let reconciliationMutex: Promise<void> | null = null;

// Track which packages were included in the last reconciliation
export let lastReconciliationPackages: Set<string> = new Set();

// Generation counters for shared egress resources (separate for each mode)
let sidecarGeneration = 0;
let ambientGeneration = 0;

// Creates ServiceEntry/Sidecar for egress and reconciles shared egress resources
export async function istioEgressResources(pkg: UDSPackage, namespace: string) {
  const istioMode = pkg.spec?.network?.serviceMesh?.mode || Mode.Sidecar;
  const pkgId = `${pkg.metadata?.name}-${pkg.metadata?.namespace}`;
  const pkgName = pkg.metadata!.name!;
  const generation = (pkg.metadata?.generation ?? 0).toString();
  const ownerRefs = getOwnerRef(pkg);

  const hostResourceMap = createHostResourceMap(pkg);
  const allowList = egressRequestedFromNetwork(pkg.spec?.network?.allow ?? []);

  if (hostResourceMap) {
    if (istioMode === Mode.Ambient) {
      try {
        await validateNamespace(ambientEgressNamespace);
      } catch (e) {
        let errText = `Unable to get the egress waypoint namespace ${ambientEgressNamespace}.`;
        if (e?.status == 404) {
          errText = `The '${ambientEgressNamespace}' namespace was not found. Ensure the 'istio-egress-ambient' component is deployed and try again.`;
        }
        log.error(errText);
        throw new Error(errText);
      }
    } else {
      await validateEgressGateway(hostResourceMap);
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

  try {
    await reconcileSharedEgressResources(
      hostResourceMap,
      pkgId,
      PackageAction.AddOrUpdate,
      istioMode,
    );
  } catch (e) {
    log.error(`Failed to reconcile shared egress resources for package ${pkgId}`, e);
    throw e;
  }
}

// reconcileSharedEgressResources reconciles the egress resources based on the config
// Handles mode transitions by updating both sidecar and ambient in-memory maps appropriately
export async function reconcileSharedEgressResources(
  hostResourceMap: HostResourceMap | undefined,
  pkgId: string,
  action: PackageAction,
  istioMode: Mode,
) {
  // Update in-memory maps based on the target mode
  if (istioMode === Mode.Ambient) {
    // Remove from sidecar map (handles sidecar -> ambient transition)
    await updateInMemoryPackageMap(hostResourceMap, pkgId, PackageAction.Remove);

    // Update ambient package list
    await updateInMemoryAmbientPackageMap(hostResourceMap, pkgId, action);
  } else {
    // Update sidecar map
    await updateInMemoryPackageMap(hostResourceMap, pkgId, action);

    // Remove from ambient list (handles ambient -> sidecar transition)
    await updateInMemoryAmbientPackageMap(hostResourceMap, pkgId, PackageAction.Remove);
  }

  // Reconcile both modes to ensure proper cleanup and application
  // This handles mode transitions and prevents resource conflicts
  return await performEgressReconciliationWithMutex(pkgId);
}

// Mutex-based reconciliation to prevent overwhelming the operator
export async function performEgressReconciliationWithMutex(pkgId: string): Promise<void> {
  // If there's already a reconciliation in progress, wait for it to complete
  if (reconciliationMutex) {
    try {
      await reconciliationMutex;
      // Check if this package was included in the last reconciliation
      if (lastReconciliationPackages.has(pkgId)) {
        return;
      }
    } catch {
      // If the previous reconciliation failed, we still need to try our own reconciliation
      // Clear the failed mutex so we can start a new one
      reconciliationMutex = null;
    }
  }

  // Start a new reconciliation
  reconciliationMutex = performEgressReconciliation();

  try {
    await reconciliationMutex;
  } catch (e) {
    // Log the error and re-throw to maintain error propagation
    log.error("Egress reconciliation failed", e);
    throw e;
  } finally {
    // Clear the mutex when done
    reconciliationMutex = null;
  }
}

// Perform sidecar egress resources reconciliation
export async function performEgressReconciliation() {
  // Capture which packages were included in this reconciliation
  updateLastReconciliationPackages();

  // Array to collect any errors that occur during reconciliation
  const errors: Error[] = [];

  // Reconcile sidecar egress resources if namespace is found
  try {
    const egressSidecarNamespace = await validateNamespace(sidecarEgressNamespace, true);
    if (egressSidecarNamespace) {
      sidecarGeneration++;

      // Apply any sidecar egress resources
      await applySidecarEgressResources(inMemoryPackageMap, sidecarGeneration);

      // Purge any orphaned sidecar shared resources
      await purgeSidecarEgressResources(sidecarGeneration.toString());
    }
  } catch (e) {
    const errText = `Failed to reconcile sidecar egress resources`;
    log.error(errText, e);
    errors.push(new Error(errText));
  }

  // Reconcile ambient egress resources if namespace is found
  try {
    const egressAmbientNamespace = await validateNamespace(ambientEgressNamespace, true);
    if (egressAmbientNamespace) {
      ambientGeneration++;

      // Apply ambient egress resources (waypoint)
      const packageSet = new Set(Object.keys(inMemoryAmbientPackageMap));
      await applyAmbientEgressResources(packageSet, ambientGeneration);

      // Purge any orphaned ambient resources (waypoint)
      await purgeAmbientEgressResources(ambientGeneration.toString());
    }
  } catch (e) {
    const errText = `Failed to reconcile ambient egress resources`;
    log.error(errText, e);
    errors.push(new Error(errText));
  }

  // If any errors occurred, aggregate them and throw
  if (errors.length > 0) {
    const aggregatedMessage = errors.map(err => err.message).join("; ");
    throw new Error(`Egress reconciliation failed: ${aggregatedMessage}`);
  }
}

// Update the inMemoryPackageMap with the latest hostResourceMap
export async function updateInMemoryPackageMap(
  hostResourceMap: HostResourceMap | undefined,
  pkgId: string,
  action: PackageAction,
) {
  // Wait for lock to be available using a promise-based queue
  if (sidecarLock) {
    await new Promise<void>(resolve => {
      sidecarLockQueue.push(resolve);
    });
  }

  try {
    log.debug("Locking egress package map for update");
    sidecarLock = true;

    if (action == PackageAction.AddOrUpdate) {
      if (hostResourceMap) {
        // Validate for protocol conflicts before updating
        validateProtocolConflicts(inMemoryPackageMap, hostResourceMap, pkgId);
        // update inMemoryPackageMap
        inMemoryPackageMap[pkgId] = hostResourceMap;
      } else {
        removeMapResources(inMemoryPackageMap, pkgId);
      }
    } else if (action == PackageAction.Remove) {
      removeMapResources(inMemoryPackageMap, pkgId);
    }
  } catch (e) {
    log.error({ action, e }, "Failed to update in memory egress package map for event");
    throw e;
  } finally {
    // unlock inMemoryPackageMap and notify next waiter
    log.debug("Unlocking egress package map for update");
    sidecarLock = false;
    const nextResolve = sidecarLockQueue.shift();
    if (nextResolve) {
      nextResolve();
    }
  }
}

// Update the inMemoryAmbientPackages list with the latest package
export async function updateInMemoryAmbientPackageMap(
  hostResourceMap: HostResourceMap | undefined,
  pkgId: string,
  action: PackageAction,
) {
  // Wait for lock to be available using a promise-based queue
  if (ambientLock) {
    await new Promise<void>(resolve => {
      ambientLockQueue.push(resolve);
    });
  }

  try {
    log.debug("Locking ambient package map for update");
    ambientLock = true;

    if (action == PackageAction.AddOrUpdate) {
      if (hostResourceMap) {
        // Validate for port conflicts before updating
        const newPackageMap = validatePortProtocolConflicts(
          inMemoryAmbientPackageMap,
          hostResourceMap,
          pkgId,
        );

        // Set newly calculated package map if no port conflicts
        inMemoryAmbientPackageMap[pkgId] = newPackageMap;
      } else {
        removeMapResources(inMemoryAmbientPackageMap, pkgId);
      }
    } else if (action == PackageAction.Remove) {
      removeMapResources(inMemoryAmbientPackageMap, pkgId);
    }
  } catch (e) {
    log.error({ action, e }, "Failed to update in memory ambient package map for event");
    throw e;
  } finally {
    // unlock inMemoryAmbientPackages and notify next waiter
    log.debug("Unlocking ambient package map for update");
    ambientLock = false;
    const nextResolve = ambientLockQueue.shift();
    if (nextResolve) {
      nextResolve();
    }
  }
}

// Update lastReconciliationPackages
export function updateLastReconciliationPackages() {
  lastReconciliationPackages = new Set([
    ...Object.keys(inMemoryPackageMap),
    ...Object.keys(inMemoryAmbientPackageMap),
  ]);
  return lastReconciliationPackages;
}

// Remap the ambient package map into a per-host EgressResource map (union of ports/protocols and packages)
export function remapAmbientEgressResources(packageMap: PackageHostMap): EgressResourceMap {
  const egressResources: EgressResourceMap = {};
  for (const pkgId in packageMap) {
    const hostResourceMap = packageMap[pkgId];
    for (const host in hostResourceMap) {
      const portProtocols = hostResourceMap[host].portProtocol;

      egressResources[host] ??= {
        packages: [],
        portProtocols: [],
      } as EgressResource;

      if (!egressResources[host].packages.includes(pkgId)) {
        egressResources[host].packages.push(pkgId);
      }

      for (const pp of portProtocols) {
        const exists = egressResources[host].portProtocols.find(
          x => x.port === pp.port && x.protocol === pp.protocol,
        );
        if (!exists) {
          egressResources[host].portProtocols.push(pp);
        }
      }
    }
  }
  return egressResources;
}

// Validate that there are no protocol conflicts for the same host/port combination
export function validateProtocolConflicts(
  currentPackageMap: PackageHostMap,
  newHostResourceMap: HostResourceMap,
  newPkgId: string,
): void {
  // Create a map of host:port -> protocol for existing packages (excluding the package being updated)
  const existingHostPortProtocols: Record<string, { protocol: RemoteProtocol; packageId: string }> =
    {};

  for (const [pkgId, hostResourceMap] of Object.entries(currentPackageMap)) {
    // Skip the package being updated since it will be replaced
    if (pkgId === newPkgId) {
      continue;
    }

    for (const [host, hostResource] of Object.entries(hostResourceMap)) {
      for (const portProtocol of hostResource.portProtocol) {
        const key = `${host}:${portProtocol.port}`;
        existingHostPortProtocols[key] = {
          protocol: portProtocol.protocol,
          packageId: pkgId,
        };
      }
    }
  }

  // Check the new host resource map for conflicts
  for (const [host, hostResource] of Object.entries(newHostResourceMap)) {
    for (const portProtocol of hostResource.portProtocol) {
      const key = `${host}:${portProtocol.port}`;
      const existing = existingHostPortProtocols[key];

      if (existing && existing.protocol !== portProtocol.protocol) {
        const errorMsg =
          `Protocol conflict detected for ${host}:${portProtocol.port}. ` +
          `Package "${newPkgId}" wants to use ${portProtocol.protocol} but package "${existing.packageId}" ` +
          `is already using ${existing.protocol} for the same host and port combination.`;
        log.error(errorMsg);
        throw new Error(errorMsg);
      }
    }
  }
}

// Validate that there are no port/protocol conflicts across packages for the same host
export function validatePortProtocolConflicts(
  currentPackageMap: PackageHostMap,
  newHostResourceMap: HostResourceMap,
  newPkgId: string,
): HostResourceMap {
  // Default to returning the new host resource map
  const calculatedPackageMap = newHostResourceMap;

  for (const [pkgId, hostResourceMap] of Object.entries(currentPackageMap)) {
    // Skip the package being updated since it will be replaced
    if (pkgId === newPkgId) {
      continue;
    }

    for (const [host, hostResource] of Object.entries(hostResourceMap)) {
      const portProtocolList = (hostResource?.portProtocol ?? []).map(
        pp => `${pp.port}-${pp.protocol}`,
      );
      for (const [newHost, newHostResource] of Object.entries(newHostResourceMap)) {
        if (host === newHost) {
          // If the host is defined in both maps, validate port/protocols don't conflict
          const newPortProtocolList = (newHostResource?.portProtocol ?? []).map(
            pp => `${pp.port}-${pp.protocol}`,
          );

          // Ensure all newPortProtocolList items are in portProtocolList
          if (!newPortProtocolList.every(pp => portProtocolList.includes(pp))) {
            const errorMsg =
              `Port/Protocol conflict detected for ${host}. ` +
              `Package "${pkgId}" is using different port/protocol combination for the same host.`;
            log.error(errorMsg);
            throw new Error(errorMsg);
          }

          // Copy portProtocols from hostResource -> newHostResource to ensure it's the superset
          if (hostResource?.portProtocol) {
            calculatedPackageMap[newHost].portProtocol = hostResource.portProtocol;
          }
        }
      }
    }
  }

  return calculatedPackageMap;
}

// Create a host resource map from a UDSPackage
export function createHostResourceMap(pkg: UDSPackage) {
  const hostResourceMap: HostResourceMap = {};

  for (const allow of pkg.spec?.network?.allow ?? []) {
    const hostPortsProtocol = getHostPortsProtocol(allow);

    if (hostPortsProtocol) {
      // Check if the host already exists in the map
      if (!hostResourceMap[hostPortsProtocol.host]) {
        hostResourceMap[hostPortsProtocol.host] = {
          portProtocol: [],
        };
      }

      // Iterate over the ports array to add port/protocol pairs
      for (const port of hostPortsProtocol.ports) {
        // Check if the port/protocol already exists
        const existingPortProtocol = hostResourceMap[hostPortsProtocol.host].portProtocol.find(
          pp => pp.port === port && pp.protocol === hostPortsProtocol.protocol,
        );

        // If it doesn't exist, add it to the list
        if (!existingPortProtocol) {
          hostResourceMap[hostPortsProtocol.host].portProtocol.push({
            port: port,
            protocol: hostPortsProtocol.protocol,
          });
        }
      }
    }
  }

  if (Object.keys(hostResourceMap).length > 0) {
    return hostResourceMap;
  }
  return undefined;
}

// Get the host, ports, and protocol from an Allow
export function getHostPortsProtocol(allow: Allow) {
  let hostPortsProtocol: HostPortsProtocol | undefined = undefined;

  const host = allow.remoteHost;
  const protocol = allow.remoteProtocol ?? RemoteProtocol.TLS;

  // reconcile ports
  let ports = [];
  if (allow.ports) {
    ports = allow.ports;
  } else if (allow.port) {
    ports = [allow.port];
  } else {
    ports = [443];
  }

  if (host) {
    hostPortsProtocol = {
      host,
      ports,
      protocol,
    };
  }
  return hostPortsProtocol;
}

// Remove resources from a given package map
export function removeMapResources(packageMap: PackageHostMap, pkgId: string) {
  if (packageMap[pkgId]) {
    delete packageMap[pkgId];
  } else {
    log.debug({ pkgId }, "No resources found for package");
  }
}

// Check if egress is requested from the network from the Allow list
export function egressRequestedFromNetwork(allowList: Allow[]) {
  return allowList.filter(allow => {
    return allow.remoteHost;
  });
}
