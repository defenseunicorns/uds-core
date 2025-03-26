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

export enum ClientStrategy {
  AUTO = "auto",
  CLIENT_CREDENTIALS = "client_credentials",
  DYNAMIC_CLIENT_REGISTRATION = "dynamic_client_registration",
}

export async function getStrategy() {
  const strategy = process.env.PEPR_KEYCLOAK_CLIENT_STRATEGY || ClientStrategy.AUTO;
  switch (strategy) {
    case ClientStrategy.CLIENT_CREDENTIALS:
      log.debug("Using Client Credentials strategy");
      return ClientStrategy.CLIENT_CREDENTIALS;
    case ClientStrategy.AUTO:
      try {
        log.debug("Probing Client Credentials strategy");
        await credentialsGetAccessToken();
        log.debug("Using Client Credentials strategy");
        return ClientStrategy.CLIENT_CREDENTIALS;
      } catch {
        log.warn("Cannot use Client Credentials, falling back to dynamic registration");
        return ClientStrategy.DYNAMIC_CLIENT_REGISTRATION;
      }
    default:
      log.warn(
        `Invalid ${process.env.PEPR_KEYCLOAK_CLIENT_STRATEGY} parameter value, falling back to dynamic registration`,
      );
      return ClientStrategy.DYNAMIC_CLIENT_REGISTRATION;
  }
}

export async function createOrUpdateClient(client: Partial<Client>, isRetry: boolean) {
  const strategy = await getStrategy();
  if (strategy === ClientStrategy.CLIENT_CREDENTIALS) {
    return credentialsCreateOrUpdate(client);
  }
  return dynamicCreateOrUpdate(client, isRetry);
}

export async function deleteClient(client: Partial<Client>) {
  const strategy = await getStrategy();
  if (strategy === ClientStrategy.CLIENT_CREDENTIALS) {
    return credentialsDelete(client);
  }
  return dynamicDelete(client);
}
