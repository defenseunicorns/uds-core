/**
 * Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */
import { IstioRequestAuthentication } from "../../../crd";

export const machineHeader = "x-uds-machine-token";
export const browserHeader = "x-uds-authservice-token";

export function buildAuthenticationPolicies(issuer: string, clientId: string) {
  const jwt = { issuer, jwksUri: `${issuer}/protocol/openid-connect/certs` };
  const workload: NonNullable<IstioRequestAuthentication["spec"]> = {
    jwtRules: [browserHeader, machineHeader].map(name => ({
      ...jwt,
      audiences: [clientId],
      fromHeaders: [{ name, prefix: "Bearer " }],
      forwardOriginalToken: false,
    })),
  };
  const ingress: NonNullable<IstioRequestAuthentication["spec"]> = {
    jwtRules: [
      {
        ...jwt,
        fromHeaders: [{ name: machineHeader, prefix: "Bearer " }],
        forwardOriginalToken: true,
      },
    ],
  };
  return { workload, ingress };
}
