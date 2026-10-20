/**
 * Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { Expose, Sso, UDSPackage } from "../../crd";
import { getFqdn } from "../domain-utils";

/** Returns the Authservice SSO entry whose redirect URI matches this expose entry. */
export function getAuthserviceSso(expose: Expose, ssoEntries: Sso[]): Sso | undefined {
  const fqdnOrigin = `https://${getFqdn(expose)}`;

  return ssoEntries.find(sso => {
    if (!sso.enableAuthserviceSelector) return false;
    return (sso.redirectUris ?? []).some(uri => {
      try {
        return new URL(uri).origin === fqdnOrigin;
      } catch {
        return false;
      }
    });
  });
}

export function getProbeClientIds(pkg: UDSPackage): Set<string> {
  const ids = new Set<string>();
  for (const expose of pkg.spec?.network?.expose ?? []) {
    if (!expose.uptime?.checks?.paths?.length) continue;
    const sso = getAuthserviceSso(expose, pkg.spec?.sso ?? []);
    if (sso) ids.add(`${sso.clientId}-probe`);
  }
  return ids;
}
