/**
 * Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { Expose, Gateway } from "../crd";
import { UDSConfig } from "./config/config";
import {
  getAdminAppUrl as getAdminAppUrlForConfig,
  getAdminBaseUrl as getAdminBaseUrlForConfig,
  getHost as getHostForConfig,
  getPublicBaseUrl as getPublicBaseUrlForConfig,
  getSsoUrl as getSsoUrlForConfig,
  normalizeContextPath,
} from "./url-utils";

export { defaultAdminContextPath, normalizeContextPath } from "./url-utils";

export function getHost(): string {
  return getHostForConfig(UDSConfig);
}

export function getPublicBaseUrl(): string {
  return getPublicBaseUrlForConfig(UDSConfig);
}

export function getAdminBaseUrl(): string {
  return getAdminBaseUrlForConfig(UDSConfig);
}

export function getSsoUrl(): string {
  return getSsoUrlForConfig(UDSConfig);
}

export function getAdminAppUrl(app: string): string {
  return getAdminAppUrlForConfig(UDSConfig, app);
}

/**
 * Get the FQDN for an expose entry based on host, domain, and gateway
 *
 * @param expose The expose entry
 * @returns The fully qualified domain name
 */
export function getFqdn(expose: Expose): string {
  if (UDSConfig.pathRouting && isCorePathRoutedHost(expose)) {
    return getHost();
  }

  const { gateway = Gateway.Tenant, host } = expose;

  // Get the correct domain based on gateway or custom domain
  let domain = UDSConfig.domain;
  if (expose.domain) {
    domain = expose.domain;
  } else if (gateway === Gateway.Admin || gateway.includes("admin")) {
    domain = UDSConfig.adminDomain;
  }

  // Add the host to the domain, unless this is the reserved root domain host (`.`)
  return host === "." ? domain : `${host}.${domain}`;
}

function isCorePathRoutedHost(expose: Expose): boolean {
  const { gateway = Gateway.Tenant, host } = expose;
  if (gateway !== Gateway.Tenant && gateway !== Gateway.Admin) {
    return false;
  }
  return host === "sso" || host === "grafana" || host === "keycloak";
}
