/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { Client } from "../types";
import {
  credentialsCreateOrUpdate,
  credentialsDelete,
  credentialsGetAccessToken,
} from "./client-credentials";
import { dynamicCreateOrUpdate, dynamicDelete } from "./dynamic-client-registration";
import { log } from "./common";

export async function getStrategy() {
  const strategy = process.env.PEPR_KEYCLOAK_CLIENT_STRATEGY || "auto";
  if (strategy === "client_credentials") {
    log.debug("Using Client Credentials strategy");
    return "client_credentials";
  } else if (strategy === "auto") {
    try {
      log.debug("Probing Client Credentials strategy");
      await credentialsGetAccessToken();
      log.debug("Using Client Credentials strategy");
      return "client_credentials";
    } catch {
      log.warn("Cannot use Client Credentials, falling back to dynamic registration");
      return "dynamic";
    }
  } else {
    log.warn(
      `Invalid ${process.env.PEPR_KEYCLOAK_CLIENT_STRATEGY} parameter value, falling back to dynamic registration`,
    );
    return "dynamic";
  }
}

export async function createOrUpdateClient(client: Partial<Client>) {
  const strategy = await getStrategy();
  if (strategy === "client_credentials") {
    return credentialsCreateOrUpdate(client);
  }
  return dynamicCreateOrUpdate(client);
}

export async function deleteClient(client: Partial<Client>) {
  const strategy = await getStrategy();
  if (strategy === "client_credentials") {
    return credentialsDelete(client);
  }
  return dynamicDelete(client);
}
