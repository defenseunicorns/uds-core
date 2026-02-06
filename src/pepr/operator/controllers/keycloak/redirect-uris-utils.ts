/**
 * Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { Expose, UDSPackage } from "../../crd";
import { generateCallbackUri } from "./callback-uri";

/**
 * Extract hostname from redirectUris, falling back to expose entries
 */
export function extractHostname(
  redirectUris: string[] | undefined,
  pkg?: UDSPackage,
  selector?: Record<string, string>,
): string {
  // Try to find a valid URI in redirectUris (prefer first valid one)
  if (redirectUris && redirectUris.length > 0) {
    for (const uri of redirectUris) {
      if (uri !== "/" && uri !== "/*") {
        try {
          return new URL(uri).hostname;
        } catch {
          // Skip invalid URLs and continue
          continue;
        }
      }
    }
  }

  // Fallback to expose entry (only if pkg and selector provided)
  if (pkg && selector) {
    const matchingExpose = findMatchingExpose(pkg, selector);
    if (matchingExpose) {
      return matchingExpose.host;
    }
  }

  throw new Error(
    `Cannot determine hostname. Either provide valid redirectUris or ensure there's an expose entry with matching selector.`,
  );
}

/**
 * Find matching expose entry based on selector
 */
export function findMatchingExpose(
  pkg: UDSPackage,
  selector: Record<string, string>,
): Expose | undefined {
  return pkg.spec?.network?.expose?.find((expose: Expose) =>
    Object.keys(selector).every(key => expose.selector && expose.selector[key] === selector[key]),
  );
}

/**
 * Check if redirectUris contains root paths
 */
export function hasRootPaths(redirectUris: string[] | undefined): boolean {
  return redirectUris ? redirectUris.some(uri => uri === "/" || uri === "/*") : false;
}

/**
 * Filter out root paths from redirectUris
 */
export function filterRootPaths(redirectUris: string[]): string[] {
  return redirectUris.filter(uri => uri !== "/" && uri !== "/*");
}

/**
 * Process redirectUris according to standardized rules
 *
 * This function handles different scenarios for redirect URI processing:
 * - If no redirectUris provided, returns only the generated callback URI
 * - If redirectUris contains valid URIs, returns them unchanged
 * - If redirectUris contains only root paths, generates callback URI
 *
 * @param redirectUris - Array of redirect URIs from the SSO client config
 * @param hostname - Hostname to use for callback URI generation
 * @param clientId - Client ID for generating unique callback URI hash
 * @returns Processed array of redirect URIs with callback URI added when needed
 */
export function processRedirectUris(
  redirectUris: string[] | undefined,
  hostname: string,
  clientId: string,
  isAuthserviceClient: boolean = false,
): string[] {
  const callbackUri = generateCallbackUri(hostname, clientId);

  if (!redirectUris || redirectUris.length === 0) {
    return [callbackUri];
  }

  // Check if all redirectUris are root paths
  if (hasRootPaths(redirectUris) && filterRootPaths(redirectUris).length === 0) {
    return [callbackUri];
  }

  // For authservice clients, always add the callback URI to existing redirect URIs
  // This ensures the authservice can redirect back to the callback endpoint
  if (isAuthserviceClient) {
    // Check if callback URI is already present to avoid duplicates
    if (!redirectUris.includes(callbackUri)) {
      return [...redirectUris, callbackUri];
    }
    return redirectUris;
  }

  // Return redirectUris unchanged - preserve user's configuration
  return redirectUris;
}
