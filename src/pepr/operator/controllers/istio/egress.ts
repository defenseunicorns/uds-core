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

// Timer for debouncing updates to the shared egress resources
let debounceTimer: NodeJS.Timeout | null = null;

// Debounce duration (1 seconds) to reduce excessive updates, configurable via environment variable
const DEBOUNCE_DURATION = parseInt(process.env.DEBOUNCE_DURATION || "1000", 10);

// Internal state for test visibility
let latestDebouncePromise: Promise<void> | null = null;

// Add this export for test environments only
export const __testOnly = {
  get latestDebouncePromise(): Promise<void> {
    if (!latestDebouncePromise) {
      throw new Error("latestDebouncePromise was null");
    }
    return latestDebouncePromise;
  },
};

let generation = 0;

export const sharedEgressPkgId = "shared-egress-resource";

// reconcileEgressResources reconciles the egress resources based on the config?
export async function reconcileSharedEgressResources(
  hostResourceMap: HostResourceMap | undefined,
  pkgId: string,
  action: PackageAction,
) {
  // Update the in-memory package map with the new host resource map
  updateInMemoryPackageMap(hostResourceMap, pkgId, action);

  // Clear the previous debounce timer, if it exists
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }

  // Set a new debounce timer to apply the update after the delay
  debounceTimer = setTimeout(() => {
    const promise = (async () => {
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
        const errText = `Failed to reconcile shared egress resources for package ID ${pkgId}`;
        log.debug(errText);
        throw e;
      } finally {
        debounceTimer = null;
      }
    })();

    latestDebouncePromise = promise;
  }, DEBOUNCE_DURATION);
}

export function updateInMemoryPackageMap(
  hostResourceMap: HostResourceMap | undefined,
  pkgId: string,
  action: PackageAction,
) {
  // Lock to prevent concurrent updates
  if (lock) {
    log.debug("Lock is set for egress package map update, retrying...");
    setTimeout(() => updateInMemoryPackageMap(hostResourceMap, pkgId, action), 0);
    return;
  }

  try {
    log.debug("Locking egress package map for update");
    lock = true;

    if (action == PackageAction.AddOrUpdate) {
      if (hostResourceMap) {
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
    // unlock inMemoryPackageMap
    log.debug("Unlocking egress package map for update");
    lock = false;
  }
}

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

export async function applyEgressResources(packageEgress: PackageHostMap, generation: number) {
  // Re-map the package egress definitions to required egress resources
  const egressResources = remapEgressResources(packageEgress);
  log.debug(`Egress resources to apply: ${JSON.stringify(egressResources)}`);

  // Apply the unique set of egress resources per defined host
  for (const host in egressResources) {
    const resource = egressResources[host];

    // Check if matching hosts exist for Gateway and Virtual Service
    try {
      await warnMatchingExistingGateways(host);
      await warnMatchingExistingVirtualServices(host);
    } catch (e) {
      log.error(`Existing istio resources found for host, ${host}: ${e}`);
      throw e;
    }

    // Generate and Apply the egress gateway
    const gateway = await generateEgressGateway(host, resource, generation);

    log.debug(gateway, `Applying Egress Gateway ${gateway.metadata?.name}`);

    // Apply the Gateway and force overwrite any existing resource
    await K8s(IstioGateway)
      .Apply(gateway, { force: true })
      .catch(async e => {
        log.error(`Failed to apply Gateway ${gateway.metadata?.name} of generation ${generation}`);
        throw e;
      });

    // Generate and Apply the egress Virtual Service
    const virtualService = await generateEgressVirtualService(host, resource, generation);

    log.debug(virtualService, `Applying Egress Virtual Service ${virtualService.metadata?.name}`);

    // Apply the Virtual Service and force overwrite any existing resource
    await K8s(IstioVirtualService)
      .Apply(virtualService, { force: true })
      .catch(async e => {
        log.error(
          `Failed to apply Virtual Service ${virtualService.metadata?.name} of generation ${generation}`,
        );
        throw e;
      });

    // Generate and Apply the egress Service Entry
    const serviceEntry = await generateSharedServiceEntry(host, resource, generation);

    log.debug(serviceEntry, `Applying Service Entry ${serviceEntry.metadata?.name}`);

    // Apply the Service Entry and force overwrite any existing resource
    await K8s(IstioServiceEntry)
      .Apply(serviceEntry, { force: true })
      .catch(async e => {
        log.error(
          `Failed to apply Service Entry ${serviceEntry.metadata?.name} of generation ${generation}`,
        );
        throw e;
      });
  }
}

export async function validateEgressGateway(hostResourceMap: HostResourceMap) {
  // Error if egress gateway is not enabled in the cluster
  await K8s(kind.Namespace)
    .Get(istioEgressGatewayNamespace)
    .catch(e => {
      if (e.status == 404) {
        const errText = `Egress gateway is not enabled in the cluster. Please enable the egress gateway and retry.`;
        log.error(errText);
        throw new Error(errText);
      } else {
        log.error(
          e,
          `Unable to reconcile get the egress gateway namespace ${istioEgressGatewayNamespace}.`,
        );
        throw e;
      }
    });

  // Validate that ports are exposed by the egress gateway
  await K8s(kind.Service)
    .InNamespace(istioEgressGatewayNamespace)
    .Get("egressgateway")
    .then(async service => {
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
    })
    .catch(e => {
      throw e;
    });
}

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

export function removeEgressResources(pkgId: string) {
  if (inMemoryPackageMap[pkgId]) {
    delete inMemoryPackageMap[pkgId];
  } else {
    log.debug("No egress resources found for package", pkgId);
  }
}

export function egressRequestedFromNetwork(allowList: Allow[]) {
  return allowList.filter(allow => {
    return allow.remoteHost;
  });
}
