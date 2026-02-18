/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */
import { GenericClass } from "kubernetes-fluent-client";
import { K8s } from "pepr";
import { IstioAuthorizationPolicy, IstioServiceEntry, K8sGateway, RemoteProtocol } from "../../crd";
import { purgeOrphans, retryWithDelay } from "../utils";
import { createEgressWaypointGateway, waitForWaypointPodHealthy } from "./ambient-waypoint";
import { generateCentralAmbientEgressAuthorizationPolicy } from "./auth-policy";
import { ambientEgressNamespace, log, sharedEgressPkgId } from "./istio-resources";
import { generateSharedAmbientServiceEntry } from "./service-entry";
import { AmbientPackageMap } from "./types";

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

// Apply the ambient egress resources
export async function applyAmbientEgressResources(
  ambientMap: AmbientPackageMap,
  generation: number,
) {
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

  // Build merged per-host resources from live packages (not the in-memory map) so that
  // shared ambient egress reconciliation remains correct across watcher restarts/OOM.
  const merged: Record<
    string,
    { packages: string[]; portProtocols: Array<{ port: number; protocol: RemoteProtocol }> }
  > = {};
  const contributingPkgIds = new Set<string>();
  const hostPortProtocols: Record<string, RemoteProtocol> = {};

  for (const [pkgId, entry] of Object.entries(ambientMap)) {
    // Anywhere participants
    for (const rule of entry.rules) {
      if (rule.kind === "anywhere") {
        const allowedPorts = rule.ports;
        if (rule.serviceAccount) {
          const principal = `cluster.local/ns/${entry.namespace}/sa/${rule.serviceAccount}`;
          if (!allowedPorts) {
            identityCache.anywhere.saPrincipals.add(principal);
          } else {
            addPortsToMap(identityCache.anywhere.saPrincipalsByPorts, principal, allowedPorts);
          }
        } else {
          if (!allowedPorts) {
            identityCache.anywhere.namespaces.add(entry.namespace);
          } else {
            addPortsToMap(identityCache.anywhere.namespacesByPorts, entry.namespace, allowedPorts);
          }
        }
      }
    }

    // Host owners + merged host resources
    for (const rule of entry.rules) {
      if (rule.kind !== "host") continue;

      const host = rule.host;
      const protocol = rule.protocol ?? RemoteProtocol.TLS;
      const ports = rule.ports;

      for (const port of ports) {
        const key = `${host}:${port}`;
        const existing = hostPortProtocols[key];
        if (existing && existing !== protocol) {
          const errorMsg =
            `Protocol conflict detected for ${host}:${port}. ` +
            `Package "${pkgId}" wants to use ${protocol} but an existing package ` +
            `is already using ${existing} for the same host and port combination.`;
          log.error(
            {
              host,
              port,
              existingProtocol: existing,
              newProtocol: protocol,
              pkgId,
            },
            errorMsg,
          );
          throw new Error(errorMsg);
        }
        hostPortProtocols[key] = protocol;
      }

      merged[host] ??= { packages: [], portProtocols: [] };
      if (!merged[host].packages.includes(pkgId)) {
        merged[host].packages.push(pkgId);
      }
      for (const port of ports) {
        const exists = merged[host].portProtocols.find(
          pp => pp.port === port && pp.protocol === protocol,
        );
        if (!exists) {
          merged[host].portProtocols.push({ port, protocol });
        }

        const hostPortMap = identityCache.byHostPort.get(host) ?? new Map();
        const portCache = hostPortMap.get(port) ?? {
          saPrincipals: new Set<string>(),
          namespaces: new Set<string>(),
        };
        if (rule.serviceAccount) {
          portCache.saPrincipals.add(
            `cluster.local/ns/${entry.namespace}/sa/${rule.serviceAccount}`,
          );
        } else {
          portCache.namespaces.add(entry.namespace);
        }
        hostPortMap.set(port, portCache);
        identityCache.byHostPort.set(host, hostPortMap);
      }

      contributingPkgIds.add(pkgId);
    }
  }

  // If there are no remoteHost-based ambient egress entries, skip creating shared ambient egress resources.
  // purgeAmbientEgressResources() will handle eventual cleanup.
  if (contributingPkgIds.size === 0) {
    return;
  }

  // Generate and apply the shared waypoint.
  const waypoint = createEgressWaypointGateway(contributingPkgIds, generation);
  const waypointName = waypoint.metadata?.name ?? "undefined";
  log.debug(waypoint, `Applying Waypoint ${waypointName}`);
  await K8s(K8sGateway).Apply(waypoint, { force: true });
  await waitForWaypointPodHealthy(ambientEgressNamespace, waypointName);

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
    const contribIds = new Set(Array.from(contributingPkgIds)); // ids are `${name}-${namespace}`
    for (const [pkgId, entry] of Object.entries(ambientMap)) {
      if (!contribIds.has(pkgId)) continue;
      await deleteBySelector(entry.namespace, entry.name, IstioServiceEntry, {
        "istio.io/use-waypoint": "egress-waypoint",
      });
      await deleteBySelector(entry.namespace, entry.name, IstioAuthorizationPolicy, {
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
export async function purgeAmbientEgressResources(
  ambientMap: AmbientPackageMap,
  generation: string,
) {
  try {
    // Determine whether there are any desired shared ambient egress resources.
    // If there are no ambient remoteHost contributors, we should allow purge to
    // clean up any leftover shared resources.
    const hasRemoteHostContributors = Object.values(ambientMap).some(entry =>
      entry.rules.some(rule => rule.kind === "host"),
    );

    const currentGenGateways = await K8s(K8sGateway)
      .InNamespace(ambientEgressNamespace)
      .WithLabel("uds/package", sharedEgressPkgId)
      .WithLabel("uds/generation", generation)
      .Get();

    const currentGenGatewayCount =
      (currentGenGateways as { items?: unknown[] } | undefined)?.items?.length ?? 0;
    if (currentGenGatewayCount === 0 && hasRemoteHostContributors) {
      log.warn(
        { generation },
        "Skipping purge of ambient egress resources because no current-generation waypoint exists",
      );
      return;
    }

    const currentGenServiceEntries = await K8s(IstioServiceEntry)
      .InNamespace(ambientEgressNamespace)
      .WithLabel("uds/package", sharedEgressPkgId)
      .WithLabel("uds/generation", generation)
      .Get();

    const currentGenServiceEntryCount =
      (currentGenServiceEntries as { items?: unknown[] } | undefined)?.items?.length ?? 0;
    if (currentGenServiceEntryCount === 0 && hasRemoteHostContributors) {
      log.warn(
        { generation },
        "Skipping purge of ambient egress resources because no current-generation shared ServiceEntries exist",
      );
      return;
    }

    await retryWithDelay(async function purgeOrphanedAmbientEgressGateways() {
      return purgeOrphans(generation, ambientEgressNamespace, sharedEgressPkgId, K8sGateway, log);
    }, log);
    await retryWithDelay(async function purgeOrphanedAmbientEgressServiceEntries() {
      return purgeOrphans(
        generation,
        ambientEgressNamespace,
        sharedEgressPkgId,
        IstioServiceEntry,
        log,
      );
    }, log);
    await retryWithDelay(async function purgeOrphanedAmbientEgressAuthorizationPolicies() {
      return purgeOrphans(
        generation,
        ambientEgressNamespace,
        sharedEgressPkgId,
        IstioAuthorizationPolicy,
        log,
      );
    }, log);
  } catch (e) {
    const errText = `Failed to purge orphaned ambient egress resources`;
    log.error(`Failed to purge orphaned ambient egress resources`, e);
    throw errText;
  }
}
