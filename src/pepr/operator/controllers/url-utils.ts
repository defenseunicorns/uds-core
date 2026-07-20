/**
 * Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import type { Config } from "./config/types";

export const defaultAdminContextPath = "";

export function normalizeContextPath(path?: string, defaultPath = ""): string {
  const rawPath = path || defaultPath;
  if (!rawPath || rawPath === "/" || rawPath.startsWith("###ZARF_VAR_")) {
    return defaultPath === "/" ? "" : defaultPath;
  }

  const withLeadingSlash = rawPath.startsWith("/") ? rawPath : `/${rawPath}`;
  return withLeadingSlash.replace(/\/+$/g, "");
}

export function getHost(config: Config): string {
  return config.domain;
}

export function getPublicBaseUrl(config: Config): string {
  return `https://${getHost(config)}${config.contextPath}`;
}

export function getAdminBaseUrl(config: Config): string {
  return `https://${config.adminDomain}${config.contextPath}${config.adminContextPath || defaultAdminContextPath}`;
}

export function getSsoUrl(config: Config): string {
  return config.pathRouting ? `${getPublicBaseUrl(config)}/sso` : `https://sso.${config.domain}`;
}

export function getAdminAppUrl(config: Config, app: string): string {
  return config.pathRouting
    ? `${getAdminBaseUrl(config)}/${app}`
    : `https://${app}.${config.adminDomain}`;
}
