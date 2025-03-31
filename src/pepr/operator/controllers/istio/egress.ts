/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */
import { K8s } from "pepr";
import { IstioDestinationRule, IstioGateway, IstioVirtualService, UDSPackage } from "../../crd";
import { RemoteProtocol } from "../../crd/generated/package-v1alpha1";
import { generateEgressGateway } from "./gateway";
import { generateDestinationRule } from "./destination-rule";
import { generateEgressVirtualService } from "./virtual-service";
import { getPackageId, log, istioEgressGatewayNamespace } from "./istio-resources";
import { EgressResourceMap, HostResourceMap, PackageAction, PackageHostMap } from "./types";
import { purgeOrphans } from "../utils";

// Cache for in-memory egress resources from package CRs
const inMemoryPackageMap: PackageHostMap = {};
let generation = 0;

export const sharedEgressPkgId = "shared-egress-resource";

// reconcileEgressResources reconciles the egress resources based on the config?
export async function reconcileSharedEgressResources(pkg: UDSPackage, action: PackageAction) {
  const pkgId = getPackageId(pkg);

  // Get the package's resources first
  if (action == PackageAction.AddOrUpdate) {
    // update the HostResourceMap
    const hostResourceMap = createHostResourceMap(pkg);

    if (hostResourceMap) {
      // update inMemoryPackageMap
      inMemoryPackageMap[pkgId] = hostResourceMap;
    } else {
      removeEgressResources(pkgId);
    }
  } else if (action == PackageAction.Remove) {
    removeEgressResources(pkgId);
  }

  // Apply the egress resources
  generation++;
  await applyEgressResources(inMemoryPackageMap, generation);

  // Purge any orphaned resources
  await purgeOrphans(
    generation.toString(),
    istioEgressGatewayNamespace,
    sharedEgressPkgId,
    IstioGateway,
    log,
  );
}

export function createHostResourceMap(pkg: UDSPackage) {
  const hostResourceMap: HostResourceMap = {};

  for (const allow of pkg.spec?.network?.allow ?? []) {
    const remoteHost = allow.remoteHost;
    const remoteProtocol = allow.remoteProtocol ?? RemoteProtocol.TLS;
    const port = allow.port || 443;

    if (remoteHost) {
      // Check if the host already exists in the map
      if (!hostResourceMap[remoteHost]) {
        hostResourceMap[remoteHost] = {
          portProtocol: [],
        };
      }

      // Check if the port/protocol already exists
      const existingPortProtocol = hostResourceMap[remoteHost].portProtocol.find(
        pp => pp.port === port && pp.protocol === remoteProtocol,
      );

      // If it doesn't exist, add it to the list
      if (!existingPortProtocol) {
        hostResourceMap[remoteHost].portProtocol.push({
          port: port,
          protocol: remoteProtocol,
        });
      }
    }
  }

  if (Object.keys(hostResourceMap).length > 0) {
    return hostResourceMap;
  }
  return null;
}

export function remapEgressResources(packageEgress: PackageHostMap) {
  const egressResources: EgressResourceMap = {};
  for (const pkgId in packageEgress) {
    const hostResourceMap = packageEgress[pkgId];
    for (const host in hostResourceMap) {
      const portProtocols = hostResourceMap[host].portProtocol;
      if (!egressResources[host]) {
        egressResources[host] = {
          packages: [],
          portProtocols: [],
        };
      }
      if (!egressResources[host].packages.includes(pkgId)) {
        egressResources[host].packages.push(pkgId);
      }
      for (const portProtocol of portProtocols) {
        const existingPortProtocol = egressResources[host].portProtocols.find(
          pp => pp.port === portProtocol.port && pp.protocol === portProtocol.protocol
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

  // Apply the unique set of egress resources per defined host
  for (const host in egressResources) {
    const resource = egressResources[host];

    // Generate and Apply the egress gateway
    const gateway = await generateEgressGateway(host, resource, generation);

    log.debug(gateway, `Applying Egress Gateway ${gateway.metadata?.name}`);

    // Apply the Gateway and force overwrite any existing resource
    await K8s(IstioGateway).Apply(gateway, { force: true })
      .catch(async e => {
        log.error(
          `Failed to apply Gateway ${gateway.metadata?.name} of generation ${generation}`,
        );
        throw e;
      });

    // Generate and Apply the egress Destination Rule
    const destinationRule = generateDestinationRule(resource, generation);

    log.debug(destinationRule, `Applying Egress Destination Rule ${destinationRule.metadata?.name}`);

    // Apply the Destination Rule and force overwrite any existing resource
    await K8s(IstioDestinationRule).Apply(destinationRule, { force: true })
      .catch(async e => {
        log.error(
          `Failed to apply Destination Rule ${destinationRule.metadata?.name} of generation ${generation}`,
        );
        throw e;
      });

    // Generate and Apply the egress Virtual Service
    const virtualService = await generateEgressVirtualService(host, resource, generation);

    log.debug(virtualService, `Applying Egress Virtual Service ${virtualService.metadata?.name}`);

    // Apply the Virtual Service and force overwrite any existing resource
    await K8s(IstioVirtualService).Apply(virtualService, { force: true })
      .catch(async e => {
        log.error(
          `Failed to apply Virtual Service ${virtualService.metadata?.name} of generation ${generation}`,
        );
        throw e;
      });
  }
}

function removeEgressResources(pkgId: string) {
  if (inMemoryPackageMap[pkgId]) {
    delete inMemoryPackageMap[pkgId];
  } else {
    log.debug("No egress resources found for package", pkgId);
  }
}