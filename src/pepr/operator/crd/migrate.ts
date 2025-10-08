/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { PkgStatus, Sso, UDSPackage } from ".";
import { AuthserviceClient } from "./generated/package-v1alpha1";

/**
 * Migrates the package to the latest version
 *
 * @param pkg the package to migrate
 * @returns
 */
export function migrate(pkg: UDSPackage) {
  const exposeList = pkg.spec?.network?.expose ?? [];

  for (const expose of exposeList) {
    // Migrate expose[].match -> expose[].advancedHTTP.match
    if (expose.match) {
      expose.advancedHTTP = expose.advancedHTTP ?? {};
      expose.advancedHTTP.match = expose.match;
      delete expose.match;
    }
  }

  const allowList = pkg.spec?.network?.allow ?? [];

  for (const allow of allowList) {
    // Migrate allow[].podLabels -> allow[].selector
    if (allow.podLabels) {
      allow.selector = allow.podLabels;
      delete allow.podLabels;
    }

    // Migrate allow[].remotePodLabels -> allow[].remoteSelector
    if (allow.remotePodLabels) {
      allow.remoteSelector = allow.remotePodLabels;
      delete allow.remotePodLabels;
    }
  }

  // Migrate status fields (aggregates all status migrations)
  migrateStatus(pkg);

  return pkg;
}

/**
 * Returns a migrated authserviceClients array for the given package status.
 * - If status.authserviceClients is undefined/empty, returns undefined
 * - If it's a legacy string[] (client IDs), returns object[] using selectors from spec.sso
 * - If it's already object[], returns it as-is
 */
export function buildMigratedAuthserviceStatus(pkg: UDSPackage): AuthserviceClient[] | undefined {
  const raw = pkg.status?.authserviceClients as unknown;
  if (!Array.isArray(raw) || raw.length === 0) return undefined;

  const first = (raw as unknown[])[0];
  // Already migrated
  if (typeof first === "object") {
    return raw as AuthserviceClient[];
  }

  // Legacy: string[] -> migrate using spec.sso selectors
  if (typeof first === "string") {
    const ssoList = (pkg.spec?.sso as Sso[] | undefined) || [];
    return (raw as string[]).map(id => {
      const match = ssoList.find(s => s.clientId === id);
      return {
        clientId: id,
        selector: match?.enableAuthserviceSelector || {},
      } as AuthserviceClient;
    });
  }

  return undefined;
}

/**
 * Mutates the package status in-place to migrate legacy authserviceClients string[] to object[]
 */
export function migrateAuthserviceStatus(pkg: UDSPackage) {
  const migrated = buildMigratedAuthserviceStatus(pkg);
  if (!migrated) return;

  const current: PkgStatus = (pkg.status as PkgStatus) ?? ({} as PkgStatus);
  pkg.status = { ...current, authserviceClients: migrated } as PkgStatus;
}

/**
 * Aggregates all status migrations. Add new status migrations here over time.
 */
export function migrateStatus(pkg: UDSPackage) {
  migrateAuthserviceStatus(pkg);
}
