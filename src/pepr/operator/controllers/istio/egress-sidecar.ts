/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */
import { V1OwnerReference } from "@kubernetes/client-node";
import { K8s, kind } from "pepr";
import { Mode } from "../../crd/generated/package-v1alpha1.js";
import {
  Allow,
  IstioGateway,
  IstioServiceEntry,
  IstioSidecar,
  IstioVirtualService,
} from "../../crd/index.js";
import { purgeOrphans, validateNamespace } from "../utils.js";
import { generateEgressGateway, warnMatchingExistingGateways } from "./gateway.js";
import { log } from "./istio-resources.js";
import { generateLocalEgressServiceEntry, generateSharedServiceEntry } from "./service-entry.js";
import { generateEgressSidecar } from "./sidecar.js";
import { EgressResource, EgressResourceMap, HostResourceMap, PackageHostMap } from "./types.js";
import {
  generateEgressVirtualService,
  warnMatchingExistingVirtualServices,
} from "./virtual-service.js";

// Sidecar Egress Gateway Namespace
export const sidecarEgressNamespace = "istio-egress-gateway";
export const sharedEgressPkgId = "shared-egress-resource";

// Apply the egress resources for all hosts
export async function applySidecarEgressResources(
  packageEgress: PackageHostMap,
  generation: number,
) {
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

// Purge any orphaned sidecar shared resources
export async function purgeSidecarEgressResources(generation: string) {
  try {
    await purgeOrphans(generation, sidecarEgressNamespace, sharedEgressPkgId, IstioGateway, log);
    await purgeOrphans(
      generation,
      sidecarEgressNamespace,
      sharedEgressPkgId,
      IstioVirtualService,
      log,
    );
    await purgeOrphans(
      generation,
      sidecarEgressNamespace,
      sharedEgressPkgId,
      IstioServiceEntry,
      log,
    );
  } catch (e) {
    const errText = `Failed to purge orphaned sidecar egress resources`;
    log.error(`Failed to purge orphaned sidecar egress resources`, e);
    throw errText;
  }
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
    await validateNamespace(sidecarEgressNamespace);
  } catch (e) {
    let errText = `Unable to get the egress gateway namespace ${sidecarEgressNamespace}.`;
    if (e?.status == 404) {
      errText = `Egress gateway is not enabled in the cluster. Please enable the egress gateway and retry.`;
    }
    log.error(errText);
    throw new Error(errText);
  }

  // Check the desired ports are exposed by the service
  const service = await K8s(kind.Service).InNamespace(sidecarEgressNamespace).Get("egressgateway");

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

// Create package owned sidecar egress resources
export async function createSidecarWorkloadEgressResources(
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
      Mode.Sidecar,
    );

    log.debug(serviceEntry, `Applying Service Entry ${serviceEntry.metadata?.name}`);

    // Apply the ServiceEntry and force overwrite any existing resource
    await K8s(IstioServiceEntry).Apply(serviceEntry, { force: true });
  }

  // Workloads with egressRequested
  const selectedWorkloads = new Set(egressRequested.map(allow => allow.selector || undefined));
  const uniqueWorkloads = new Set<string>();

  // Add sidecar for each unique workload
  for (const workload of selectedWorkloads) {
    // Skip if we've already processed this workload
    if (uniqueWorkloads.has(JSON.stringify(workload))) {
      continue;
    }
    uniqueWorkloads.add(JSON.stringify(workload));

    // Create Sidecar
    const sidecar = generateEgressSidecar(workload, pkgName, namespace, generation, ownerRefs);

    log.debug(sidecar, `Applying Sidecar ${sidecar.metadata?.name}`);

    // Apply the Sidecar and force overwrite any existing resource
    await K8s(IstioSidecar).Apply(sidecar, { force: true });
  }
}
