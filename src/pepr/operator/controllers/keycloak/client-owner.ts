/**
 * Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { K8s } from "pepr";
import { UDSPackage } from "../../crd";
import { SsoProtocol } from "../../crd/generated/package-v1alpha1";
import { getGeneratedProbeClientIds, getProbeClientId } from "../uptime/probe-client-utils";

export const PACKAGE_OWNER_UID_ATTRIBUTE = "uds.core.package-uid";

const PACKAGE_COLLECTION_URL = "/apis/uds.dev/v1alpha1/packages";
const PACKAGE_PAGE_SIZE = 500;

/** The Kubernetes identity used to prove ownership of an operator-managed client. */
export interface PackageClientOwner {
  uid: string;
  namespace: string;
  name: string;
}

interface PackageListPage {
  items?: UDSPackage[];
  metadata?: {
    continue?: string;
  };
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

/**
 * Read every current Package using the API's continuation token. A partial list
 * cannot prove that a Package is the sole claimant, so malformed or repeated
 * continuation results fail closed.
 */
export async function listLivePackages(): Promise<UDSPackage[]> {
  const packages: UDSPackage[] = [];
  const seenContinueTokens = new Set<string>();
  let continuation: string | undefined;

  do {
    const query = new URLSearchParams({ limit: PACKAGE_PAGE_SIZE.toString() });
    if (continuation) {
      query.set("continue", continuation);
    }

    const page = (await K8s(UDSPackage).Raw(
      `${PACKAGE_COLLECTION_URL}?${query.toString()}`,
    )) as unknown as PackageListPage;
    if (!page || !Array.isArray(page.items)) {
      throw new Error(
        "Kubernetes returned an incomplete Package list; client ownership cannot be verified",
      );
    }

    packages.push(...page.items);
    continuation = page.metadata?.continue || undefined;
    if (continuation && seenContinueTokens.has(continuation)) {
      throw new Error(
        "Kubernetes repeated a Package list continuation token; client ownership cannot be verified",
      );
    }
    if (continuation) {
      seenContinueTokens.add(continuation);
    }
  } while (continuation);

  return packages;
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

/**
 * Determine whether a legacy, unmarked Keycloak client has one operator-managed
 * configuration shape and unique operator-written Package status corroboration.
 */
export function hasLegacyOperatorManagementEvidence(
  pkg: UDSPackage,
  clientId: string,
  client: {
    attributes?: Record<string, string>;
    fullScopeAllowed?: boolean;
    serviceAccountsEnabled?: boolean;
    standardFlowEnabled?: boolean;
    protocolMappers?: Array<{
      name?: string;
      protocol?: string;
      protocolMapper?: string;
      config?: Record<string, string>;
    }>;
  },
): boolean {
  if (!pkg.status?.ssoClients?.includes(clientId)) {
    return false;
  }

  // convertSsoToClient always writes this attribute, even with no declared groups.
  const ordinaryClient = Object.hasOwn(client.attributes ?? {}, "uds.core.groups");
  const audienceMappers = (client.protocolMappers ?? []).filter(
    mapper =>
      mapper.name === "audience" &&
      mapper.protocol === SsoProtocol.OpenidConnect &&
      mapper.protocolMapper === "oidc-audience-mapper",
  );
  const audienceClientId = audienceMappers[0]?.config?.["included.client.audience"];
  const probeClient =
    client.fullScopeAllowed === false &&
    client.serviceAccountsEnabled === true &&
    client.standardFlowEnabled === false &&
    audienceMappers.length === 1 &&
    typeof audienceClientId === "string" &&
    getProbeClientId(audienceClientId) === clientId;

  return ordinaryClient !== probeClient;
}
