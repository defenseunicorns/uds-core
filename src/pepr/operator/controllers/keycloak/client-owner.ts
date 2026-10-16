/**
 * Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { K8s } from "pepr";
import { UDSPackage } from "../../crd";
import { getGeneratedProbeClientIds } from "../uptime/probe-client-utils";

export const PACKAGE_OWNER_UID_ATTRIBUTE = "uds.core.package-uid";

/** The Kubernetes identity used to prove ownership of an operator-managed client. */
export interface PackageClientOwner {
  uid: string;
  namespace: string;
  name: string;
}

/**
 * Derive the owner from the Package object that is being reconciled.
 * Namespace and name are diagnostic only; the UID is the ownership authority.
 */
export function getPackageClientOwner(pkg: UDSPackage): PackageClientOwner {
  const { uid, namespace, name } = pkg.metadata ?? {};
  if (!uid || !namespace || !name) {
    throw new Error(
      "Cannot manage a Keycloak client for a Package without metadata.uid, namespace, and name",
    );
  }
  return { uid, namespace, name };
}

/** Returns the unique ordinary and generated client IDs from a Package's current spec. */
export function getEffectivePackageClientIds(pkg: UDSPackage): Set<string> {
  return new Set([
    ...(pkg.spec?.sso ?? []).map(sso => sso.clientId),
    ...getGeneratedProbeClientIds(pkg),
  ]);
}

/** Read every current Package; a partial list cannot prove sole ownership. */
export async function listLivePackages(): Promise<UDSPackage[]> {
  const list = await K8s(UDSPackage).Get();
  // Get returns raw JSON with "continue", though V1ListMeta types it as "_continue".
  if (!Array.isArray(list?.items) || Reflect.get(list?.metadata ?? {}, "continue")) {
    throw new Error(
      "Kubernetes returned an incomplete Package list; client ownership cannot be verified",
    );
  }
  return list.items;
}

/**
 * Confirm that the requesting Package UID is the only current Package claiming
 * this ID. This live check protects Keycloak writes from stale admission state.
 */
export async function assertSoleLivePackageClaim(
  clientId: string,
  owner: PackageClientOwner,
): Promise<UDSPackage> {
  return assertSoleLivePackageClaimIn(await listLivePackages(), clientId, owner);
}

/** Check a Package list already fetched for this operation. */
export function assertSoleLivePackageClaimIn(
  packages: UDSPackage[],
  clientId: string,
  owner: PackageClientOwner,
): UDSPackage {
  const claimants = packages.filter(pkg => getEffectivePackageClientIds(pkg).has(clientId));
  if (claimants.length !== 1 || claimants[0].metadata?.uid !== owner.uid) {
    const claimantRefs = claimants.map(
      pkg => `${pkg.metadata?.namespace ?? "?"}/${pkg.metadata?.name ?? "?"}`,
    );
    const detail = claimantRefs.length ? ` Current claimants: ${claimantRefs.join(", ")}.` : "";
    throw new Error(
      `Package ${owner.namespace}/${owner.name} is not the sole current claimant for Keycloak client "${clientId}".${detail}`,
    );
  }
  return claimants[0];
}

/**
 * Confirm a live owner and reject another Package currently claiming an ID
 * during cleanup. The owner may no longer claim it in spec after a change.
 */
export function assertPackageCanDeleteClient(
  packages: UDSPackage[],
  clientId: string,
  owner: PackageClientOwner,
): UDSPackage {
  const currentOwner = assertCurrentPackageUid(packages, owner, clientId);
  const otherClaimants = packages.filter(
    pkg => pkg.metadata?.uid !== owner.uid && getEffectivePackageClientIds(pkg).has(clientId),
  );
  if (otherClaimants.length) {
    const claimantRefs = otherClaimants.map(
      pkg => `${pkg.metadata?.namespace ?? "?"}/${pkg.metadata?.name ?? "?"}`,
    );
    throw new Error(
      `Cannot delete Keycloak client "${clientId}" because another Package currently claims it: ${claimantRefs.join(", ")}`,
    );
  }
  return currentOwner;
}

/** Confirm that the Package UID is still present before performing cleanup. */
export function assertCurrentPackageUid(
  packages: UDSPackage[],
  owner: PackageClientOwner,
  clientId: string,
): UDSPackage {
  const currentOwner = packages.find(pkg => pkg.metadata?.uid === owner.uid);
  if (!currentOwner) {
    throw new Error(
      `Package ${owner.namespace}/${owner.name} (UID ${owner.uid}) is no longer current; cannot delete Keycloak client "${clientId}"`,
    );
  }
  return currentOwner;
}

/**
 * A stale cleanup is complete when another UID now owns the marked client and
 * is the sole current claimant, while the former Package records the ID only
 * in status history. This check never authorizes a Keycloak mutation.
 */
export function isCompletedPackageClientHandoff(
  packages: UDSPackage[],
  clientId: string,
  formerOwner: PackageClientOwner,
  currentOwnerUid: string,
): boolean {
  const formerPackage = packages.find(pkg => pkg.metadata?.uid === formerOwner.uid);
  if (
    !formerPackage?.status?.ssoClients?.includes(clientId) ||
    getEffectivePackageClientIds(formerPackage).has(clientId)
  ) {
    return false;
  }

  const currentClaimants = packages.filter(pkg => getEffectivePackageClientIds(pkg).has(clientId));
  return currentClaimants.length === 1 && currentClaimants[0].metadata?.uid === currentOwnerUid;
}

/**
 * Require unique Package status history before adopting or deleting an
 * unmarked legacy client. Status is only useful when no other live Package
 * records the same client ID.
 */
export function assertUnambiguousPackageHistory(
  packages: UDSPackage[],
  clientId: string,
  owner: PackageClientOwner,
): UDSPackage {
  const currentOwner = packages.find(pkg => pkg.metadata?.uid === owner.uid);
  if (!currentOwner || !currentOwner.status?.ssoClients?.includes(clientId)) {
    throw new Error(
      `Keycloak client "${clientId}" has no recorded history for current Package ${owner.namespace}/${owner.name}`,
    );
  }

  const historicalClaimants = packages.filter(pkg => pkg.status?.ssoClients?.includes(clientId));
  if (historicalClaimants.length !== 1 || historicalClaimants[0].metadata?.uid !== owner.uid) {
    const claimantRefs = historicalClaimants.map(
      pkg => `${pkg.metadata?.namespace ?? "?"}/${pkg.metadata?.name ?? "?"}`,
    );
    throw new Error(
      `Keycloak client "${clientId}" has ambiguous Package history${claimantRefs.length ? `: ${claimantRefs.join(", ")}` : ""}`,
    );
  }
  return currentOwner;
}
