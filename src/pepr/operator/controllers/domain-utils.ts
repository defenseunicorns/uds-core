/**
 * Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { Expose, Gateway } from "../crd";
import { UDSConfig } from "./config/config";

export const defaultAdminContextPath = "/admin";

export function normalizeContextPath(path?: string, defaultPath = ""): string {
  const rawPath = path || defaultPath;
  if (!rawPath || rawPath === "/" || rawPath.startsWith("###ZARF_VAR_")) {
    return defaultPath === "/" ? "" : defaultPath;
  }

  const withLeadingSlash = rawPath.startsWith("/") ? rawPath : `/${rawPath}`;
  return withLeadingSlash.replace(/\/+$/g, "");
}

export function getHost(): string {
  return UDSConfig.subdomain ? `${UDSConfig.subdomain}.${UDSConfig.domain}` : UDSConfig.domain;
}

export function getPublicBaseUrl(): string {
  return `https://${getHost()}${UDSConfig.contextPath}`;
}

export function getAdminBaseUrl(): string {
  return `${getPublicBaseUrl()}${UDSConfig.adminContextPath || defaultAdminContextPath}`;
}

export function getSsoUrl(): string {
  return UDSConfig.pathRouting ? `${getPublicBaseUrl()}/sso` : `https://sso.${UDSConfig.domain}`;
}

export function getAdminAppUrl(app: string): string {
  return UDSConfig.pathRouting ? `${getAdminBaseUrl()}/${app}` : `https://${app}.${UDSConfig.adminDomain}`;
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
