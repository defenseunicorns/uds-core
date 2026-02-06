/**
 * Copyright 2024-2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

/**
 * Generate callback URI for authservice
 */
export function generateCallbackUri(hostname: string, clientId: string): string {
  // Create a base64url-encoded hash of the clientId (first 8 chars)
  const hash = Buffer.from(clientId).toString("base64url").substring(0, 8);
  return `https://${hostname}/.uds/auth/callback/${hash}`;
}
