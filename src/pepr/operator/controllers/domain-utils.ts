/**
 * Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { Expose, Gateway } from "../crd";
import { UDSConfig } from "./config/config";

/**
 * Get the FQDN for an expose entry based on host, domain, and gateway
 *
 * @param expose The expose entry
 * @returns The fully qualified domain name
 */
export function getFqdn(expose: Expose): string {
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
