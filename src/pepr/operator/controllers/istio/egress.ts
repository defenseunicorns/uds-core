/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */
import { Allow, Direction, RemoteGenerated, RemoteProtocol, UDSPackage } from "../../crd";
import { Mode } from "../../crd/generated/package-v1alpha1";
import { validateNamespace } from "../utils";
import { applyAmbientEgressResources, purgeAmbientEgressResources } from "./egress-ambient";
import { getAllowedPorts, getPortsForHostAllow } from "./egress-ports";
import {
  applySidecarEgressResources,
  purgeSidecarEgressResources,
  sidecarEgressNamespace,
} from "./egress-sidecar";
import { ambientEgressNamespace, log } from "./istio-resources";
import {
  AmbientEgressRule,
  AmbientPackageEntry,
  AmbientPackageMap,
  HostPortsProtocol,
  HostResourceMap,
  PackageAction,
  PackageHostMap,
} from "./types";

// Cache for in-memory sidecar-only shared egress resources from package CRs
export const inMemoryPackageMap: PackageHostMap = {};

let sidecarMapUpdateQueue: Promise<void> = Promise.resolve();

// Cache for in-memory ambient egress resources from package CRs
export const inMemoryAmbientPackageMap: AmbientPackageMap = {};

let ambientMapUpdateQueue: Promise<void> = Promise.resolve();

function validateAmbientProtocolConflicts(
  currentAmbientMap: AmbientPackageMap,
  newEntry: AmbientPackageEntry,
  newPkgId: string,
): void {
  const existingHostPortProtocols: Record<string, { protocol: RemoteProtocol; packageId: string }> =
    {};

  for (const [pkgId, entry] of Object.entries(currentAmbientMap)) {
    // Skip the package being updated since it will be replaced
    if (pkgId === newPkgId) {
      continue;
    }

    for (const rule of entry.rules) {
      if (rule.kind !== "host") continue;
      for (const port of rule.ports) {
        const key = `${rule.host}:${port}`;
        existingHostPortProtocols[key] = {
          protocol: rule.protocol ?? RemoteProtocol.TLS,
          packageId: pkgId,
        };
      }
    }
  }

  for (const rule of newEntry.rules) {
    if (rule.kind !== "host") continue;
    for (const port of rule.ports) {
      const key = `${rule.host}:${port}`;
      const existing = existingHostPortProtocols[key];
      const desiredProtocol = rule.protocol ?? RemoteProtocol.TLS;
      if (existing && existing.protocol !== desiredProtocol) {
        const errorMsg =
          `Protocol conflict detected for ${rule.host}:${port}. ` +
          `Package "${newPkgId}" wants to use ${desiredProtocol} but package "${existing.packageId}" ` +
          `is already using ${existing.protocol} for the same host and port combination.`;
        log.error(errorMsg);
        throw new Error(errorMsg);
      }
    }
  }
}

// Mutexes to prevent concurrent reconciliation operations for each mode
let reconcileInFlight: Promise<void> | null = null;

// Flag to ensure we never skip a reconciliation request that arrives
// while a reconciliation is in progress.
let reconcileDirty = false;

// Generation counters for shared egress resources (separate for each mode)
let sidecarGeneration = 0;
let ambientGeneration = 0;

// reconcileSharedEgressResources reconciles the egress resources based on the config
// Handles mode transitions by updating both sidecar and ambient in-memory maps appropriately
export async function reconcileSharedEgressResources(
  pkg: UDSPackage,
  hostResourceMap: HostResourceMap | undefined,
  action: PackageAction,
  istioMode: Mode,
) {
  const pkgName = pkg.metadata?.name;
  const pkgNamespace = pkg.metadata?.namespace;
  if (!pkgName || !pkgNamespace) {
    throw new Error("Package metadata.name and metadata.namespace are required");
  }
  const pkgId = `${pkgName}-${pkgNamespace}`;

  // Update in-memory maps based on the target mode
  if (istioMode === Mode.Ambient) {
    // Remove from sidecar map (handles sidecar -> ambient transition)
    await updateInMemoryPackageMap(hostResourceMap, pkgId, PackageAction.Remove);

    // Update ambient package list
    await updateInMemoryAmbientPackageMap(pkg, pkgId, action);
  } else {
    // Update sidecar map
    await updateInMemoryPackageMap(hostResourceMap, pkgId, action);

    // Remove from ambient list (handles ambient -> sidecar transition)
    await updateInMemoryAmbientPackageMap(pkg, pkgId, PackageAction.Remove);
  }

  // Reconcile both modes to ensure proper cleanup and application
  // This handles mode transitions and prevents resource conflicts
  await performEgressReconciliationWithMutex();
}

function createAmbientPackageEntry(pkg: UDSPackage): AmbientPackageEntry {
  const name = pkg.metadata?.name;
  const namespace = pkg.metadata?.namespace;
  if (!name || !namespace) {
    throw new Error("Package metadata.name and metadata.namespace are required");
  }

  const rules: AmbientEgressRule[] = [];
  for (const allow of pkg.spec?.network?.allow ?? []) {
    if (allow.direction !== Direction.Egress) {
      continue;
    }

    // Anywhere participants (no host) used for AP sources.
    if (allow.remoteGenerated === RemoteGenerated.Anywhere) {
      rules.push({
        kind: "anywhere",
        ports: getAllowedPorts(allow),
        serviceAccount: allow.serviceAccount,
      });
      continue;
    }

    // Host-scoped egress rules
    if (allow.remoteHost) {
      const protocol = allow.remoteProtocol ?? RemoteProtocol.TLS;
      const ports = getPortsForHostAllow({
        ports: allow.ports,
        port: allow.port,
        remoteProtocol: protocol,
      });
      rules.push({
        kind: "host",
        host: allow.remoteHost,
        ports,
        protocol,
        serviceAccount: allow.serviceAccount,
      });
    }
  }

  return { name, namespace, rules };
}

// Mutex-based reconciliation to prevent overwhelming the operator
export async function performEgressReconciliationWithMutex(): Promise<void> {
  // If a reconciliation is already running, mark that another run is needed and wait.
  // The running reconciliation will do an additional pass before releasing the mutex.
  if (reconcileInFlight) {
    reconcileDirty = true;
    await reconcileInFlight;
    return;
  }

  // Start a new reconciliation loop.
  reconcileDirty = true;
  reconcileInFlight = (async () => {
    const startMs = Date.now();
    let passCount = 0;

    while (reconcileDirty) {
      reconcileDirty = false;
      passCount++;
      await performEgressReconciliation();
    }

    log.debug(
      {
        passCount,
        durationMs: Date.now() - startMs,
        additionalPasses: passCount > 1,
      },
      "Egress reconciliation completed",
    );
  })();

  try {
    await reconcileInFlight;
  } catch (e) {
    // Log the error and re-throw to maintain error propagation
    log.error("Egress reconciliation failed", e);
    throw e;
  } finally {
    // Clear the mutex when done
    reconcileInFlight = null;
  }
}

// Perform sidecar egress resources reconciliation
export async function performEgressReconciliation() {
  // Array to collect any errors that occur during reconciliation
  const errors: Error[] = [];

  // Reconcile sidecar egress resources if namespace is found
  try {
    const egressSidecarNamespace = await validateNamespace(sidecarEgressNamespace, true);
    if (egressSidecarNamespace) {
      sidecarGeneration++;

      // Apply any sidecar egress resources. Only purge if apply succeeds.
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

      // Apply ambient egress resources (waypoint). Only purge if apply succeeds.
      await applyAmbientEgressResources(inMemoryAmbientPackageMap, ambientGeneration);

      // Purge any orphaned ambient resources (waypoint)
      await purgeAmbientEgressResources(inMemoryAmbientPackageMap, ambientGeneration.toString());
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
  const task = sidecarMapUpdateQueue
    .catch(() => undefined)
    .then(() => {
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
    });

  // Keep the queue healthy even if this update fails.
  sidecarMapUpdateQueue = task.catch(() => undefined);
  return task;
}

// Update the inMemoryAmbientPackages list with the latest package
export async function updateInMemoryAmbientPackageMap(
  pkg: UDSPackage,
  pkgId: string,
  action: PackageAction,
) {
  const task = ambientMapUpdateQueue
    .catch(() => undefined)
    .then(() => {
      if (action == PackageAction.AddOrUpdate) {
        const entry = createAmbientPackageEntry(pkg);
        validateAmbientProtocolConflicts(inMemoryAmbientPackageMap, entry, pkgId);
        inMemoryAmbientPackageMap[pkgId] = entry;
      } else if (action == PackageAction.Remove) {
        if (inMemoryAmbientPackageMap[pkgId]) {
          delete inMemoryAmbientPackageMap[pkgId];
        }
      }
    });

  // Keep the queue healthy even if this update fails.
  ambientMapUpdateQueue = task.catch(() => undefined);
  return task;
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

  const ports = getPortsForHostAllow({
    ports: allow.ports,
    port: allow.port,
    remoteProtocol: protocol,
  });

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
