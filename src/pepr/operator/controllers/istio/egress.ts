/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */
import { K8s, kind } from "pepr";
import {
  Allow,
  IstioGateway,
  IstioServiceEntry,
  IstioVirtualService,
  RemoteProtocol,
  UDSPackage,
} from "../../crd";
import { purgeOrphans } from "../utils";
import { generateEgressGateway, warnMatchingExistingGateways } from "./gateway";
import { istioEgressGatewayNamespace, log } from "./istio-resources";
import { generateSharedServiceEntry } from "./service-entry";
import {
  EgressResource,
  EgressResourceMap,
  HostPortsProtocol,
  HostResourceMap,
  PackageAction,
  PackageHostMap,
} from "./types";
import {
  generateEgressVirtualService,
  warnMatchingExistingVirtualServices,
} from "./virtual-service";

// Cache for in-memory egress resources from package CRs
export const inMemoryPackageMap: PackageHostMap = {};

// Lock to prevent concurrent updates to the inMemoryPackageMap
let lock = false;
// eslint-disable-next-line prefer-const
let lockQueue: (() => void)[] = [];

// Mutex to prevent concurrent reconciliation operations
let reconciliationMutex: Promise<void> | null = null;

// Generation counter for shared egress resources
let generation = 0;

// Track which packages were included in the last reconciliation
let lastReconciliationPackages: Set<string> = new Set();

// Unique identifier for shared egress resources
export const sharedEgressPkgId = "shared-egress-resource";

// reconcileEgressResources reconciles the egress resources based on the config
export async function reconcileSharedEgressResources(
  hostResourceMap: HostResourceMap | undefined,
  pkgId: string,
  action: PackageAction,
) {
  // Update the in-memory package map with the new host resource map
  await updateInMemoryPackageMap(hostResourceMap, pkgId, action);

  // Use a mutex-like approach to prevent overwhelming the operator
  // Multiple packages can update the map, but only one reconciliation runs at a time
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

// Perform the actual egress reconciliation
export async function performEgressReconciliation() {
  try {
    // Check if the istioEgressGatewayNamespace exists
    try {
      await K8s(kind.Namespace).Get(istioEgressGatewayNamespace);
    } catch (e) {
      if (e?.status == 404) {
        log.debug(
          `Namespace ${istioEgressGatewayNamespace} not found. Skipping shared egress resource reconciliation.`,
        );
        return;
      } else {
        throw e;
      }
    }

    generation++;

    // Capture which packages are included in this reconciliation
    lastReconciliationPackages = new Set(Object.keys(inMemoryPackageMap));

    // Apply any egress resources
    await applyEgressResources(inMemoryPackageMap, generation);

    // Purge any orphaned shared resources
    await purgeOrphans(
      generation.toString(),
      istioEgressGatewayNamespace,
      sharedEgressPkgId,
      IstioGateway,
      log,
    );
    await purgeOrphans(
      generation.toString(),
      istioEgressGatewayNamespace,
      sharedEgressPkgId,
      IstioVirtualService,
      log,
    );
    await purgeOrphans(
      generation.toString(),
      istioEgressGatewayNamespace,
      sharedEgressPkgId,
      IstioServiceEntry,
      log,
    );
  } catch (e) {
    const errText = `Failed to reconcile shared egress resources`;
    log.error(errText, e);
    throw e;
  }
}

export async function updateInMemoryPackageMap(
  hostResourceMap: HostResourceMap | undefined,
  pkgId: string,
  action: PackageAction,
) {
  // Wait for lock to be available using a promise-based queue
  if (lock) {
    await new Promise<void>(resolve => {
      lockQueue.push(resolve);
    });
  }

  try {
    log.debug("Locking egress package map for update");
    lock = true;

    if (action == PackageAction.AddOrUpdate) {
      if (hostResourceMap) {
        // Validate for protocol conflicts before updating
        validateProtocolConflicts(inMemoryPackageMap, hostResourceMap, pkgId);
        // update inMemoryPackageMap
        inMemoryPackageMap[pkgId] = hostResourceMap;
      } else {
        removeEgressResources(pkgId);
      }
    } else if (action == PackageAction.Remove) {
      removeEgressResources(pkgId);
    }
  } catch (e) {
    log.error("Failed to update in memory egress package map for event", action, e);
    throw e;
  } finally {
    // unlock inMemoryPackageMap and notify next waiter
    log.debug("Unlocking egress package map for update");
    lock = false;
    const nextResolve = lockQueue.shift();
    if (nextResolve) {
      nextResolve();
    }
  }
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

// Remap the package egress definitions to required egress resources
export function remapEgressResources(packageEgress: PackageHostMap) {
  const egressResources: EgressResourceMap = {};
  for (const pkgId in packageEgress) {
    const hostResourceMap = packageEgress[pkgId];
    for (const host in hostResourceMap) {
      const portProtocols = hostResourceMap[host].portProtocol;

      egressResources[host] ??= {
        packages: [],
        portProtocols: [],
      };

      if (!egressResources[host].packages.includes(pkgId)) {
        egressResources[host].packages.push(pkgId);
      }

      for (const portProtocol of portProtocols) {
        const existingPortProtocol = egressResources[host].portProtocols.find(
          pp => pp.port === portProtocol.port && pp.protocol === portProtocol.protocol,
        );

        if (!existingPortProtocol) {
          egressResources[host].portProtocols.push(portProtocol);
        }
      }
    }
  }

  return egressResources;
}

// Apply the egress resources for all hosts
export async function applyEgressResources(packageEgress: PackageHostMap, generation: number) {
  // Re-map the package egress definitions to required egress resources
  const egressResources = remapEgressResources(packageEgress);

  // Apply the unique set of egress resources per defined host
  const applyPromises: Promise<void>[] = [];

  for (const host in egressResources) {
    const resource = egressResources[host];

    // Create a promise for applying this host's resources
    const hostPromise = applyHostResources(host, resource, generation);
    applyPromises.push(hostPromise);
  }

  // Wait for all host resources to be applied
  await Promise.all(applyPromises);
}

// Apply resources for a given host
async function applyHostResources(host: string, resource: EgressResource, generation: number) {
  try {
    // Check if matching hosts exist for Gateway and Virtual Service
    await warnMatchingExistingGateways(host);
    await warnMatchingExistingVirtualServices(host);

    // Apply each resource type with individual error handling
    const resourcePromises: Promise<void>[] = [];

    // Generate and Apply the egress gateway
    const gatewayPromise = (async () => {
      try {
        const gateway = generateEgressGateway(host, resource, generation);
        log.debug(gateway, `Applying Egress Gateway ${gateway.metadata?.name}`);
        await K8s(IstioGateway).Apply(gateway, { force: true });
      } catch (e) {
        const errText = `Failed to apply Gateway for host ${host}`;
        log.error(errText, e);
        throw new Error(errText);
      }
    })();
    resourcePromises.push(gatewayPromise);

    // Generate and Apply the egress Virtual Service
    const virtualServicePromise = (async () => {
      try {
        const virtualService = generateEgressVirtualService(host, resource, generation);
        log.debug(
          virtualService,
          `Applying Egress Virtual Service ${virtualService.metadata?.name}`,
        );
        await K8s(IstioVirtualService).Apply(virtualService, { force: true });
      } catch (e) {
        const errText = `Failed to apply Virtual Service for host ${host}`;
        log.error(errText, e);
        throw new Error(errText);
      }
    })();
    resourcePromises.push(virtualServicePromise);

    // Generate and Apply the egress Service Entry
    const serviceEntryPromise = (async () => {
      try {
        const serviceEntry = generateSharedServiceEntry(host, resource, generation);
        log.debug(serviceEntry, `Applying Service Entry ${serviceEntry.metadata?.name}`);
        await K8s(IstioServiceEntry).Apply(serviceEntry, { force: true });
      } catch (e) {
        const errText = `Failed to apply Service Entry for host ${host}`;
        log.error(errText, e);
        throw new Error(errText);
      }
    })();
    resourcePromises.push(serviceEntryPromise);

    // Wait for all resource applications to complete
    await Promise.all(resourcePromises);
  } catch (e) {
    log.error(`Failed to apply egress resources for host ${host} of generation ${generation}`, e);
    throw e;
  }
}

// Validate that namespace exists and ports are exposed by the Istio egress gateway
export async function validateEgressGateway(hostResourceMap: HostResourceMap) {
  // Error if egress gateway is not enabled in the cluster
  try {
    await K8s(kind.Namespace).Get(istioEgressGatewayNamespace);
  } catch (e) {
    let errText = `Unable to reconcile get the egress gateway namespace ${istioEgressGatewayNamespace}.`;
    if (e.status == 404) {
      errText = `Egress gateway is not enabled in the cluster. Please enable the egress gateway and retry.`;
    }
    log.error(errText);
    throw new Error(errText);
  }

  // Check the desired ports are exposed by the service
  const service = await K8s(kind.Service)
    .InNamespace(istioEgressGatewayNamespace)
    .Get("egressgateway");

  const ports = service.spec?.ports ?? [];
  for (const host in hostResourceMap) {
    for (const portProtocol of hostResourceMap[host].portProtocol) {
      const port = ports.find(p => p.port === portProtocol.port);
      if (!port) {
        const errText = `Egress gateway does not expose port ${portProtocol.port} for host ${host}. Please update the egress gateway service to expose this port.`;
        log.error(errText);
        throw new Error(errText);
      }
    }
  }
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

// Remove egress resources for a package
export function removeEgressResources(pkgId: string) {
  if (inMemoryPackageMap[pkgId]) {
    delete inMemoryPackageMap[pkgId];
  } else {
    log.debug("No egress resources found for package", pkgId);
  }
}

// Check if egress is requested from the network from the Allow list
export function egressRequestedFromNetwork(allowList: Allow[]) {
  return allowList.filter(allow => {
    return allow.remoteHost;
  });
}
