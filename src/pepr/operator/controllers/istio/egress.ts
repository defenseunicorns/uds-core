/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */
import { V1OwnerReference } from "@kubernetes/client-node";
import { K8s, kind } from "pepr";
import {
  Allow,
  IstioAuthorizationPolicy,
  IstioGateway,
  IstioServiceEntry,
  IstioSidecar,
  IstioVirtualService,
  IstioWaypoint,
  RemoteProtocol,
  UDSPackage,
} from "../../crd";
import { purgeOrphans } from "../utils";
import { generateAuthorizationPolicy } from "./auth-policy";
import { generateEgressGateway, warnMatchingExistingGateways } from "./gateway";
import { istioEgressGatewayNamespace, istioEgressWaypointNamespace, log } from "./istio-resources";
import { IstioState } from "./namespace";
import {
  generateLocalEgressSEName,
  generateLocalEgressServiceEntry,
  generateSharedServiceEntry,
} from "./service-entry";
import { generateEgressSidecar } from "./sidecar";
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
import { generateWaypoint } from "./waypoint";

// Cache for in-memory sidecar-only shared egress resources from package CRs
export const inMemoryPackageMap: PackageHostMap = {};

// Lock to prevent concurrent updates to the inMemoryPackageMap
let lock = false;
// eslint-disable-next-line prefer-const
let lockQueue: (() => void)[] = [];

// Cache for in-memory ambient egress resources from package CRs
export const inMemoryAmbientPackages: string[] = [];
let ambientLock = false;
// eslint-disable-next-line prefer-const
let ambientLockQueue: (() => void)[] = [];

// Mutexes to prevent concurrent reconciliation operations for each mode
let sidecarReconciliationMutex: Promise<void> | null = null;
let ambientReconciliationMutex: Promise<void> | null = null;

// Generation counters for shared egress resources (separate for each mode)
let sidecarGeneration = 0;
let ambientGeneration = 0;

// Track which packages were included in the last reconciliation for each mode
let lastSidecarReconciliationPackages: Set<string> = new Set();
let lastAmbientReconciliationPackages: Set<string> = new Set();

// Unique identifier for shared egress resources
export const sharedEgressPkgId = "shared-egress-resource";

// reconcileSharedEgressResources reconciles the egress resources based on the config
// Handles mode transitions by updating both sidecar and ambient in-memory maps appropriately
export async function reconcileSharedEgressResources(
  hostResourceMap: HostResourceMap | undefined,
  pkgId: string,
  action: PackageAction,
  istioMode: string,
) {
  // Update in-memory maps based on the target mode
  if (istioMode === IstioState.Ambient) {
    // Remove from sidecar map (handles sidecar -> ambient transition)
    await updateInMemoryPackageMap(hostResourceMap, pkgId, PackageAction.Remove);
    // Update ambient package list
    await updateInMemoryAmbientPackages(pkgId, action);
  } else {
    // Update sidecar map
    await updateInMemoryPackageMap(hostResourceMap, pkgId, action);
    // Remove from ambient list (handles ambient -> sidecar transition)
    await updateInMemoryAmbientPackages(pkgId, PackageAction.Remove);
  }

  // Reconcile both modes to ensure proper cleanup and application
  // This handles mode transitions and prevents resource conflicts
  return await performEgressReconciliationWithMutex(pkgId, istioMode);
}

// Mutex-based reconciliation to prevent stomping of shared resources
// Always reconciles both sidecar and ambient modes to handle mode transitions.
// When a package switches from sidecar -> ambient or ambient -> sidecar, we need to:
// 1. Clean up resources from the old mode
// 2. Apply resources for the new mode
// This ensures proper cleanup and prevents resource conflicts.
export async function performEgressReconciliationWithMutex(
  pkgId: string,
  istioMode: string,
): Promise<void> {
  // Wait for any existing reconciliations to complete before starting new ones
  const waitPromises: Promise<void>[] = [];

  if (sidecarReconciliationMutex) {
    waitPromises.push(
      sidecarReconciliationMutex.catch(() => {
        // Clear failed mutex
        sidecarReconciliationMutex = null;
      }),
    );
  }

  if (ambientReconciliationMutex) {
    waitPromises.push(
      ambientReconciliationMutex.catch(() => {
        // Clear failed mutex
        ambientReconciliationMutex = null;
      }),
    );
  }

  // Check current reconciliation state for this package
  const inSidecarReconciliation = lastSidecarReconciliationPackages.has(pkgId);
  const inAmbientReconciliation = lastAmbientReconciliationPackages.has(pkgId);

  // Wait for all existing reconciliations to complete
  if (waitPromises.length > 0) {
    await Promise.all(waitPromises);

    // Check if this package is already in the correct state for its mode
    // This ensures proper mode transitions and prevents unnecessary reconciliations
    if (istioMode === IstioState.Ambient) {
      // For ambient mode: package should be in ambient tracking and NOT in sidecar tracking
      // This ensures the package has been properly transitioned from sidecar to ambient
      if (inAmbientReconciliation && !inSidecarReconciliation) {
        log.debug(`Package ${pkgId} already properly reconciled for ambient mode, skipping`);
        return;
      }
    } else {
      // For sidecar mode: package should be in sidecar tracking and NOT in ambient tracking
      // This ensures the package has been properly transitioned from ambient to sidecar
      if (inSidecarReconciliation && !inAmbientReconciliation) {
        log.debug(`Package ${pkgId} already properly reconciled for sidecar mode, skipping`);
        return;
      }
    }
  }

  // Log the current state before reconciliation
  log.debug(
    `Starting egress reconciliation for package ${pkgId} (mode: ${istioMode}). ` +
      `Current state - sidecar: ${inSidecarReconciliation}, ambient: ${inAmbientReconciliation}`,
  );

  // Start reconciliation for both modes to handle mode transitions
  const sidecarPromise = performSidecarEgressReconciliation();
  const ambientPromise = performAmbientEgressReconciliation();

  sidecarReconciliationMutex = sidecarPromise;
  ambientReconciliationMutex = ambientPromise;

  try {
    // Wait for both reconciliations to complete
    await Promise.all([sidecarPromise, ambientPromise]);
    log.debug(`Egress reconciliation completed for package ${pkgId} (mode: ${istioMode})`);
  } catch (e) {
    // Log the error and re-throw to maintain error propagation
    log.error(`Egress reconciliation failed for package ${pkgId} (mode: ${istioMode})`, e);
    throw e;
  } finally {
    // Clear both mutexes when done
    sidecarReconciliationMutex = null;
    ambientReconciliationMutex = null;
  }
}

// Perform sidecar egress resources reconciliation
export async function performSidecarEgressReconciliation() {
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

    sidecarGeneration++;

    // Capture which packages are included in this reconciliation
    lastSidecarReconciliationPackages = new Set(Object.keys(inMemoryPackageMap));

    // Apply any egress resources
    await applyEgressResources(inMemoryPackageMap, sidecarGeneration);

    // Purge any orphaned shared resources
    await purgeOrphans(
      sidecarGeneration.toString(),
      istioEgressGatewayNamespace,
      sharedEgressPkgId,
      IstioGateway,
      log,
    );
    await purgeOrphans(
      sidecarGeneration.toString(),
      istioEgressGatewayNamespace,
      sharedEgressPkgId,
      IstioVirtualService,
      log,
    );
    await purgeOrphans(
      sidecarGeneration.toString(),
      istioEgressGatewayNamespace,
      sharedEgressPkgId,
      IstioServiceEntry,
      log,
    );
  } catch (e) {
    const errText = `Failed to reconcile shared sidecar egress resources`;
    log.error(errText, e);
    throw e;
  }
}

// Perform ambient egress resources reconciliation
export async function performAmbientEgressReconciliation() {
  try {
    // Check if the istioEgressWaypointNamespace exists
    try {
      await K8s(kind.Namespace).Get(istioEgressWaypointNamespace);
    } catch (e) {
      if (e?.status == 404) {
        log.debug(
          `Namespace ${istioEgressWaypointNamespace} not found. Skipping ambient egress resource reconciliation.`,
        );
        return;
      } else {
        throw e;
      }
    }

    ambientGeneration++;

    // Capture which packages are included in this reconciliation
    lastAmbientReconciliationPackages = new Set(inMemoryAmbientPackages);

    // Apply ambient egress resources (waypoint)
    await applyAmbientEgressResources(inMemoryAmbientPackages, ambientGeneration);

    // Purge any orphaned ambient resources (waypoint)
    await purgeOrphans(
      ambientGeneration.toString(),
      istioEgressWaypointNamespace,
      sharedEgressPkgId,
      IstioWaypoint,
      log,
    );
  } catch (e) {
    const errText = `Failed to reconcile shared ambient egress resources`;
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

export async function updateInMemoryAmbientPackages(pkgId: string, action: PackageAction) {
  // Wait for lock to be available using a promise-based queue
  if (ambientLock) {
    await new Promise<void>(resolve => {
      ambientLockQueue.push(resolve);
    });
  }

  try {
    log.debug("Locking ambient package list for update");
    ambientLock = true;

    if (action == PackageAction.AddOrUpdate) {
      inMemoryAmbientPackages.push(pkgId);
    } else if (action == PackageAction.Remove) {
      const index = inMemoryAmbientPackages.indexOf(pkgId);
      if (index > -1) {
        inMemoryAmbientPackages.splice(index, 1);
      }
    }
  } catch (e) {
    log.error("Failed to update in memory ambient package list for event", action, e);
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

// Apply the ambient egress resources
export async function applyAmbientEgressResources(packageList: string[], generation: number) {
  // If no packages using ambient egress, don't create the waypoint
  if (packageList.length === 0) {
    return;
  }

  // Generate the waypoint payload
  const waypoint = generateWaypoint(packageList, generation);

  // Apply waypoint
  log.debug(waypoint, `Applying Waypoint ${waypoint.metadata?.name}`);

  // Apply the Waypoint and force overwrite any existing resource
  await K8s(IstioWaypoint).Apply(waypoint, { force: true });
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
    let errText = `Unable to get the egress gateway namespace ${istioEgressGatewayNamespace}.`;
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

// Validate that the egress waypoint namespace exists
// TODO: tests
export async function validateEgressWaypoint() {
  // Error if egress waypoint is not enabled in the cluster
  try {
    await K8s(kind.Namespace).Get(istioEgressWaypointNamespace);
  } catch (e) {
    let errText = `Unable to get the egress waypoint namespace ${istioEgressWaypointNamespace}.`;
    if (e.status == 404) {
      errText = `Egress waypoint is not enabled in the cluster. Please enable the egress waypoint and retry.`;
    }
    log.error(errText);
    throw new Error(errText);
  }
}

// Create package owned sidecar egress resources
// TODO: Update/add tests
export async function createSidecarWorkloadEgressResources(
  hostResourceMap: HostResourceMap,
  allowList: Allow[],
  pkgName: string,
  namespace: string,
  generation: string,
  ownerRefs: V1OwnerReference[],
) {
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
      false,
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

// Create package owned ambient egress resources
// TODO: Add tests for this
export async function createAmbientWorkloadEgressResources(
  hostResourceMap: HostResourceMap,
  egressRequested: Allow[],
  pkgName: string,
  namespace: string,
  generation: string,
  ownerRefs: V1OwnerReference[],
) {
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
      true,
    );

    log.debug(serviceEntry, `Applying Service Entry ${serviceEntry.metadata?.name}`);

    // Apply the ServiceEntry and force overwrite any existing resource
    await K8s(IstioServiceEntry).Apply(serviceEntry, { force: true });
  }

  // Create Authorization Policy for service entry, if serviceAccount is specified
  for (const allow of egressRequested) {
    if (allow.serviceAccount) {
      const serviceAccount = allow.serviceAccount;
      const hostPortsProtocol = getHostPortsProtocol(allow);
      if (!hostPortsProtocol) {
        continue;
      }
      const { host, ports, protocol } = hostPortsProtocol;
      const portsProtocol = ports.map(port => ({ port, protocol }));

      // Validate serviceAccount exists - else all egress traffic will fail
      try {
        await K8s(kind.ServiceAccount).InNamespace(namespace).Get(serviceAccount);
      } catch {
        const errText = `ServiceAccount ${serviceAccount} does not exist in namespace ${namespace}. Please create the ServiceAccount and retry.`;
        log.error(errText);
        throw new Error(errText);
      }

      // Create Authorization Policy
      const authPolicy = generateAuthorizationPolicy(
        host,
        pkgName,
        namespace,
        generation,
        ownerRefs,
        generateLocalEgressSEName(pkgName, portsProtocol, host),
        serviceAccount,
      );

      log.debug(authPolicy, `Applying Authorization Policy ${authPolicy.metadata?.name}`);

      // Apply the AuthorizationPolicy and force overwrite any existing resource
      await K8s(IstioAuthorizationPolicy).Apply(authPolicy, { force: true });
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
