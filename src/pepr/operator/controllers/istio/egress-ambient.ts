/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */
import { GenericClass } from "kubernetes-fluent-client";
import { K8s } from "pepr";
import {
  Direction,
  IstioAuthorizationPolicy,
  IstioServiceEntry,
  K8sGateway,
  RemoteGenerated,
  UDSPackage,
} from "../../crd";
import { Mode } from "../../crd/generated/package-v1alpha1";
import { purgeOrphans } from "../utils";
import { createEgressWaypointGateway, waitForWaypointPodHealthy } from "./ambient-waypoint";
import { generateCentralAmbientEgressAuthorizationPolicy } from "./auth-policy";
import { inMemoryAmbientPackageMap, remapAmbientEgressResources } from "./egress";
import { getAllowedPorts, getPortsForHostAllow } from "./egress-ports";
import { ambientEgressNamespace, log, sharedEgressPkgId } from "./istio-resources";
import { generateSharedAmbientServiceEntry } from "./service-entry";

function addPortsToMap(map: Map<string, Set<number>>, key: string, ports: number[]) {
  const portSet = map.get(key) ?? new Set<number>();
  for (const p of ports) portSet.add(p);
  map.set(key, portSet);
}

async function deleteBySelector(
  namespace: string,
  pkgName: string,
  kind: GenericClass,
  labels: Record<string, string>,
) {
  let query = K8s(kind).InNamespace(namespace).WithLabel("uds/package", pkgName);
  for (const [k, v] of Object.entries(labels)) {
    query = query.WithLabel(k, v);
  }
  const resources = await query.Get();
  for (const resource of resources.items) {
    try {
      await K8s(kind).Delete(resource);
    } catch (e) {
      log.warn(
        {
          err: e,
          namespace,
          pkgName,
          kind: resource.kind,
          name: resource.metadata?.name,
        },
        "Failed deleting legacy ambient egress resource (continuing)",
      );
    }
  }
}

interface IdentityCache {
  anywhere: {
    saPrincipals: Set<string>;
    namespaces: Set<string>;
    saPrincipalsByPorts: Map<string, Set<number>>;
    namespacesByPorts: Map<string, Set<number>>;
  };
  byHostPort: Map<string, Map<number, { saPrincipals: Set<string>; namespaces: Set<string> }>>;
}

// derive owners for a given host from the contributing package IDs
export function deriveOwnersFromContributors(
  host: string,
  port: number,
  contributingPkgIds: string[],
  pkgItems: UDSPackage[],
) {
  const ownerSaPrincipals = new Set<string>();
  const ownerNamespaces = new Set<string>();
  const contributing = new Set(contributingPkgIds ?? []);
  for (const pkg of pkgItems) {
    // During deletion, the Package can remain visible while its finalizer runs.
    // Exclude these to avoid temporarily granting identities from a removing package.
    if (pkg.metadata?.deletionTimestamp) {
      continue;
    }
    const ns = pkg.metadata?.namespace;
    const name = pkg.metadata?.name;
    if (!ns || !name) {
      continue;
    }
    const id = `${name}-${ns}`;
    const mode = pkg.spec?.network?.serviceMesh?.mode || Mode.Sidecar;
    if (!contributing.has(id) || mode !== Mode.Ambient) continue;
    for (const allow of pkg.spec?.network?.allow ?? []) {
      if (allow.direction === Direction.Egress && allow.remoteHost === host) {
        const ports = getPortsForHostAllow(allow);
        if (!ports.includes(port)) {
          continue;
        }
        if (allow.serviceAccount) {
          ownerSaPrincipals.add(`cluster.local/ns/${ns}/sa/${allow.serviceAccount}`);
        } else {
          ownerNamespaces.add(ns);
        }
      }
    }
  }
  return { ownerSaPrincipals, ownerNamespaces };
}

// Apply the ambient egress resources
export async function applyAmbientEgressResources(packageList: Set<string>, generation: number) {
  // If no packages using ambient egress, don't create the waypoint
  if (packageList.size === 0) {
    return;
  }

  // Generate the waypoint payload
  const waypoint = createEgressWaypointGateway(packageList, generation);
  const waypointName = waypoint.metadata?.name ?? "undefined";

  // Apply waypoint
  log.debug(waypoint, `Applying Waypoint ${waypointName}`);

  // Apply the Waypoint and force overwrite any existing resource
  await K8s(K8sGateway).Apply(waypoint, { force: true });

  await waitForWaypointPodHealthy(ambientEgressNamespace, waypointName);

  // Fetch UDSPackages once to derive identities and avoid PackageStore timing issues
  const pkgList = await K8s(UDSPackage).Get();
  const pkgItems = (pkgList as { items?: UDSPackage[] } | undefined)?.items ?? [];

  // Build merged per-host resources across ambient packages
  const merged = remapAmbientEgressResources(inMemoryAmbientPackageMap);

  // Initialize the cache
  const identityCache: IdentityCache = {
    anywhere: {
      saPrincipals: new Set<string>(),
      namespaces: new Set<string>(),
      saPrincipalsByPorts: new Map<string, Set<number>>(),
      namespacesByPorts: new Map<string, Set<number>>(),
    },
    byHostPort: new Map(),
  };

  // Filter only ambient packages for faster processing
  const ambientPkgs = pkgItems.filter(
    pkg =>
      !pkg.metadata?.deletionTimestamp &&
      (pkg.spec?.network?.serviceMesh?.mode || Mode.Sidecar) === Mode.Ambient,
  );

  // Process each ambient package
  for (const pkg of ambientPkgs) {
    const ns = pkg.metadata?.namespace;
    if (!ns) {
      continue;
    }

    // Filter only egress rules for faster processing
    const egressRules = (pkg.spec?.network?.allow ?? []).filter(
      allow => allow.direction === Direction.Egress,
    );

    for (const allow of egressRules) {
      // Process Anywhere participants
      if (allow.remoteGenerated === RemoteGenerated.Anywhere) {
        const allowedPorts = getAllowedPorts(allow);

        if (allow.serviceAccount) {
          const principal = `cluster.local/ns/${ns}/sa/${allow.serviceAccount}`;
          if (!allowedPorts) {
            identityCache.anywhere.saPrincipals.add(principal);
          } else {
            addPortsToMap(identityCache.anywhere.saPrincipalsByPorts, principal, allowedPorts);
          }
        } else {
          if (!allowedPorts) {
            identityCache.anywhere.namespaces.add(ns);
          } else {
            addPortsToMap(identityCache.anywhere.namespacesByPorts, ns, allowedPorts);
          }
        }
        continue;
      }

      // Process host owners
      if (allow.remoteHost) {
        const ports = getPortsForHostAllow(allow);
        const host = allow.remoteHost;
        const hostPortMap = identityCache.byHostPort.get(host) ?? new Map();
        for (const port of ports) {
          const portCache = hostPortMap.get(port) ?? {
            saPrincipals: new Set<string>(),
            namespaces: new Set<string>(),
          };
          if (allow.serviceAccount) {
            portCache.saPrincipals.add(`cluster.local/ns/${ns}/sa/${allow.serviceAccount}`);
          } else {
            portCache.namespaces.add(ns);
          }
          hostPortMap.set(port, portCache);
        }
        identityCache.byHostPort.set(host, hostPortMap);
      }
    }
  }

  // Extract the sets for use in the rest of the function
  const participantAnyPortSaPrincipals = identityCache.anywhere.saPrincipals;
  const participantAnyPortNamespaces = identityCache.anywhere.namespaces;

  // Apply per-host shared SE and centralized AP
  for (const host of Object.keys(merged)) {
    const resource = merged[host];
    const hostPorts = Array.from(new Set((resource.portProtocols ?? []).map(pp => pp.port))).sort(
      (a, b) => a - b,
    );

    const identitiesByPort: Record<string, { saPrincipals: string[]; namespaces: string[] }> = {};
    const allSa = new Set<string>();
    const allNs = new Set<string>();

    for (const port of hostPorts) {
      // Build identities for this specific destination port.
      const participantSaPrincipals = new Set<string>(participantAnyPortSaPrincipals);
      const participantNamespaces = new Set<string>(participantAnyPortNamespaces);

      for (const [principal, allowed] of identityCache.anywhere.saPrincipalsByPorts.entries()) {
        if (allowed.has(port)) {
          participantSaPrincipals.add(principal);
        }
      }
      for (const [ns, allowed] of identityCache.anywhere.namespacesByPorts.entries()) {
        if (allowed.has(port)) {
          participantNamespaces.add(ns);
        }
      }

      const hostPortMap = identityCache.byHostPort.get(host);
      const portOwners = hostPortMap?.get(port);
      const ownerSaPrincipals = new Set<string>(portOwners?.saPrincipals ?? []);
      const ownerNamespaces = new Set<string>(portOwners?.namespaces ?? []);

      if (ownerSaPrincipals.size === 0 && ownerNamespaces.size === 0) {
        const derived = deriveOwnersFromContributors(host, port, resource.packages ?? [], pkgItems);
        for (const p of derived.ownerSaPrincipals) ownerSaPrincipals.add(p);
        for (const n of derived.ownerNamespaces) ownerNamespaces.add(n);
      }

      const saPrincipals = Array.from(
        new Set<string>([...ownerSaPrincipals, ...participantSaPrincipals]),
      ).sort();
      const namespaces = Array.from(
        new Set<string>([...ownerNamespaces, ...participantNamespaces]),
      ).sort();

      for (const p of saPrincipals) allSa.add(p);
      for (const n of namespaces) allNs.add(n);

      identitiesByPort[String(port)] = { saPrincipals, namespaces };
    }

    const saPrincipals = Array.from(allSa).sort();
    const namespaces = Array.from(allNs).sort();

    // Apply central AuthorizationPolicy targeting the per-host ServiceEntry (host-scoped)
    // If no sources are available yet, skip creating SE/AP to avoid a window of allow.
    log.debug(
      {
        host,
        saPrincipalsCount: saPrincipals.length,
        namespacesCount: namespaces.length,
        ports: hostPorts,
        contributingPackages: resource.packages,
      },
      "Resolved ambient egress identities for host",
    );
    if (saPrincipals.length === 0 && namespaces.length === 0) {
      log.warn(
        { host },
        "Skipping ambient egress resources for host due to empty source identities (owners/participants not yet resolved)",
      );
      continue;
    }

    // Apply shared Ambient ServiceEntry only when we have at least one source identity
    const se = generateSharedAmbientServiceEntry(host, resource, generation);
    log.debug(se, `Applying Ambient Shared ServiceEntry ${se.metadata?.name}`);
    await K8s(IstioServiceEntry).Apply(se, { force: true });

    const ap = generateCentralAmbientEgressAuthorizationPolicy(
      host,
      generation,
      {
        saPrincipals,
        namespaces,
      },
      resource.packages ?? [],
      identitiesByPort,
    );
    log.debug(ap, `Applying Ambient Central AuthorizationPolicy ${ap.metadata?.name}`);
    await K8s(IstioAuthorizationPolicy).Apply(ap, { force: true });
  }

  // Cleanup: purge legacy local egress resources created prior to ambient changes
  // Criteria per package (in its namespace):
  // - ServiceEntry with labels: uds/package=<pkgName> AND istio.io/use-waypoint=egress-waypoint
  // - AuthorizationPolicy with labels: uds/package=<pkgName> AND uds/for=egress
  // Only for packages that are Ambient and contributed to this central reconcile
  try {
    const contribIds = new Set(Array.from(packageList)); // ids are `${name}-${namespace}`
    for (const pkg of pkgItems) {
      const ns = pkg.metadata?.namespace;
      const name = pkg.metadata?.name;
      const mode = pkg.spec?.network?.serviceMesh?.mode || Mode.Sidecar;
      if (!ns || !name || mode !== Mode.Ambient) continue;
      const id = `${name}-${ns}`;
      if (!contribIds.has(id)) continue;

      await deleteBySelector(ns, name, IstioServiceEntry, {
        "istio.io/use-waypoint": "egress-waypoint",
      });
      await deleteBySelector(ns, name, IstioAuthorizationPolicy, {
        "uds/for": "egress",
      });
    }
  } catch (e) {
    log.warn(
      { err: e },
      "Failed purging legacy local egress resources for ambient packages (non-fatal)",
    );
  }
}

// Purge any orphaned ambient egress resources
export async function purgeAmbientEgressResources(generation: string) {
  try {
    await purgeOrphans(generation, ambientEgressNamespace, sharedEgressPkgId, K8sGateway, log);
    await purgeOrphans(
      generation,
      ambientEgressNamespace,
      sharedEgressPkgId,
      IstioServiceEntry,
      log,
    );
    await purgeOrphans(
      generation,
      ambientEgressNamespace,
      sharedEgressPkgId,
      IstioAuthorizationPolicy,
      log,
    );
  } catch (e) {
    const errText = `Failed to purge orphaned ambient egress resources`;
    log.error(`Failed to purge orphaned ambient egress resources`, e);
    throw errText;
  }
}
