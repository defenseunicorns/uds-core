/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { Component, setupLogger } from "../../../../logger.js";

export let baseUrl = "http://keycloak-http.keycloak.svc.cluster.local:8080";
// Support dev mode with port-forwarded keycloak svc
if (process.env.PEPR_MODE === "dev") {
  baseUrl = "http://localhost:8080";
}

export const log = setupLogger(Component.OPERATOR_KEYCLOAK);

export interface RestResponse {
  ok: boolean;
  status: number;
  statusText: string;
  data: unknown;
}

export async function throwErrorIfNeeded(response: RestResponse, onError?: (error: Error) => void) {
  if (!response.ok) {
    const { status, statusText, data } = response;
    const err = new Error(`${status}, ${statusText}, ${data ? JSON.stringify(data) : ""}`);
    if (onError) {
      onError(err);
    }
    throw err;
  }
}
