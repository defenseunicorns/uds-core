/**
 * Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

export const envoyDefaultGatewayName = "envoy-default-gateway";
export const envoyDefaultGatewayNamespace = "envoy-default-gateway";
export const envoyGatewaySystemNamespace = "envoy-gateway-system";

export function getUDPGatewayPortKey(gateway: string | undefined, port: number): string {
  return `${gateway || envoyDefaultGatewayName}:${port}`;
}

export function getUDPGatewayName(gateway: string | undefined): string {
  return gateway || envoyDefaultGatewayName;
}

export function getUDPGatewayNamespace(gateway: string | undefined): string {
  return gateway || envoyDefaultGatewayNamespace;
}
