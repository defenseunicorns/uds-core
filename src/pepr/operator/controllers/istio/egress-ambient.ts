/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */
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
import { ambientEgressNamespace, log, sharedEgressPkgId } from "./istio-resources";
import { generateSharedAmbientServiceEntry } from "./service-entry";

export { ambientEgressNamespace, sharedEgressPkgId };

// derive owners for a given host from the contributing package IDs
export function deriveOwnersFromContributors(
  host: string,
  contributingPkgIds: string[],
  pkgItems: UDSPackage[],
) {
  const ownerSaPrincipals = new Set<string>();
  const ownerNamespaces = new Set<string>();
  const contributing = new Set(contributingPkgIds ?? []);
  for (const pkg of pkgItems) {
    const ns = pkg.metadata?.namespace;
    const name = pkg.metadata?.name;
    if (!ns || !name) {
      continue;
    }
    const id = `${name}-${ns}`;
    const mode = pkg.spec?.network?.serviceMesh?.mode || Mode.Sidecar;
    if (!contributing.has(id) || mode !== Mode.Ambient) continue;
    for (const allow of pkg.spec?.network?.allow ?? []) {
      if (allow.direction !== Direction.Egress) continue;
      if (allow.remoteHost !== host) continue;
      if (allow.serviceAccount) {
        ownerSaPrincipals.add(`cluster.local/ns/${ns}/sa/${allow.serviceAccount}`);
      } else {
        ownerNamespaces.add(ns);
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

  // Pre-index identities in a single optimized pass
  // Create a map structure to hold all identity information
  interface IdentityCache {
    anywhere: {
      saPrincipals: Set<string>;
      namespaces: Set<string>;
    };
    byHost: Map<
      string,
      {
        saPrincipals: Set<string>;
        namespaces: Set<string>;
      }
    >;
  }

  // Initialize the cache
  const identityCache: IdentityCache = {
    anywhere: {
      saPrincipals: new Set<string>(),
      namespaces: new Set<string>(),
    },
    byHost: new Map(),
  };

  // Filter only ambient packages for faster processing
  const ambientPkgs = pkgItems.filter(
    pkg => (pkg.spec?.network?.serviceMesh?.mode || Mode.Sidecar) === Mode.Ambient,
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
        if (allow.serviceAccount) {
          identityCache.anywhere.saPrincipals.add(
            `cluster.local/ns/${ns}/sa/${allow.serviceAccount}`,
          );
        } else {
          identityCache.anywhere.namespaces.add(ns);
        }
        continue;
      }

      // Process host owners
      if (allow.remoteHost) {
        // Ensure the host entry exists in the cache
        if (!identityCache.byHost.has(allow.remoteHost)) {
          identityCache.byHost.set(allow.remoteHost, {
            saPrincipals: new Set<string>(),
            namespaces: new Set<string>(),
          });
        }

        const hostCache = identityCache.byHost.get(allow.remoteHost)!;

        if (allow.serviceAccount) {
          hostCache.saPrincipals.add(`cluster.local/ns/${ns}/sa/${allow.serviceAccount}`);
        } else {
          hostCache.namespaces.add(ns);
        }
      }
    }
  }

  // Extract the sets for use in the rest of the function
  const participantSaPrincipals = identityCache.anywhere.saPrincipals;
  const participantNamespaces = identityCache.anywhere.namespaces;
  const ownerSaByHost = new Map<string, Set<string>>();
  const ownerNsByHost = new Map<string, Set<string>>();

  // Convert the identity cache to the expected format
  for (const [host, identities] of identityCache.byHost.entries()) {
    if (identities.saPrincipals.size > 0) {
      ownerSaByHost.set(host, identities.saPrincipals);
    }
    if (identities.namespaces.size > 0) {
      ownerNsByHost.set(host, identities.namespaces);
    }
  }

  // Apply per-host shared SE and centralized AP
  for (const host of Object.keys(merged)) {
    const resource = merged[host];
    // Initialize owner identities for this host from pre-indexed maps
    const ownerSaPrincipals = new Set<string>(ownerSaByHost.get(host) ?? []);
    const ownerNamespaces = new Set<string>(ownerNsByHost.get(host) ?? []);

    // if no explicit owners found (e.g., transient store state), derive owners
    // by correlating contributing package IDs with the actual packages in the store. The pkgId
    // format is `${name}-${namespace}` (see getPackageId()). Prefer SA principals when specified
    // on the allow rule for this host; otherwise, use the namespace as a source.
    if (ownerSaPrincipals.size === 0 && ownerNamespaces.size === 0) {
      const derived = deriveOwnersFromContributors(host, resource.packages ?? [], pkgItems);
      for (const p of derived.ownerSaPrincipals) ownerSaPrincipals.add(p);
      for (const n of derived.ownerNamespaces) ownerNamespaces.add(n);
    }

    // Combine owners + participants
    const saPrincipals = Array.from(
      new Set<string>([...ownerSaPrincipals, ...participantSaPrincipals]),
    ).sort();
    const namespaces = Array.from(
      new Set<string>([...ownerNamespaces, ...participantNamespaces]),
    ).sort();

    // Apply central AuthorizationPolicy targeting the per-host ServiceEntry (host-scoped)
    // If no sources are available yet, skip creating SE/AP to avoid a window of allow.
    log.debug(
      {
        host,
        saPrincipals,
        namespaces,
        ownerSaPrincipals: Array.from(ownerSaPrincipals),
        ownerNamespaces: Array.from(ownerNamespaces),
        participantSaPrincipals: Array.from(participantSaPrincipals),
        participantNamespaces: Array.from(participantNamespaces),
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

    const ap = generateCentralAmbientEgressAuthorizationPolicy(host, generation, {
      saPrincipals,
      namespaces,
    });
    log.debug(ap, `Applying Ambient Central AuthorizationPolicy ${ap.metadata?.name}`);
    await K8s(IstioAuthorizationPolicy).Apply(ap, { force: true });
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
