/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { R } from "pepr";
import { UDSConfig } from "../../../../config";
import { Component, setupLogger } from "../../../../logger";
import { UDSPackage } from "../../../crd";
import { Client } from "../types";
import { updatePolicy } from "./authorization-policy";
import {
  getAuthserviceConfig,
  operatorConfig,
  setAuthserviceConfig,
  updateAuthServiceSecret,
} from "./config";
import { Action, AuthServiceEvent, AuthserviceConfig, Chain } from "./types";

export const log = setupLogger(Component.OPERATOR_AUTHSERVICE);
let lock = false;

export async function authservice(pkg: UDSPackage, clients: Map<string, Client>) {
  // Get the list of clients from the package
  const authServiceClients = R.filter(
    sso => R.isNotNil(sso.enableAuthserviceSelector),
    pkg.spec?.sso || [],
  );

  for (const sso of authServiceClients) {
    const client = clients.get(sso.clientId);
    if (!client) {
      throw new Error(`Failed to get client ${sso.clientId}`);
    }

    await reconcileAuthservice(
      { name: sso.clientId, action: Action.Add, client },
      sso.enableAuthserviceSelector!,
      pkg,
    );
  }

  const authserviceClients = authServiceClients.map(client => client.clientId);

  await purgeAuthserviceClients(pkg, authserviceClients);

  return authserviceClients;
}

export async function purgeAuthserviceClients(
  pkg: UDSPackage,
  newAuthserviceClients: string[] = [],
) {
  // compute set difference of pkg.status.authserviceClients and authserviceClients using Ramda
  R.difference(pkg.status?.authserviceClients || [], newAuthserviceClients).forEach(
    async clientId => {
      log.info(`Removing stale authservice chain for client ${clientId}`);
      await reconcileAuthservice({ name: clientId, action: Action.Remove }, {}, pkg);
    },
  );
}

export async function reconcileAuthservice(
  event: AuthServiceEvent,
  labelSelector: { [key: string]: string },
  pkg: UDSPackage,
) {
  await updateConfig(event);
  await updatePolicy(event, labelSelector, pkg);
}

// Write authservice config to secret (ensure the new function name is referenced)
export async function updateConfig(event: AuthServiceEvent) {
  // Lock to prevent concurrent updates
  if (lock) {
    log.info("Lock is set for config update, retrying...");
    setTimeout(() => updateConfig(event), 0);
    return;
  }

  log.info("Locking config for update");
  lock = true;

  // Parse existing authservice config
  let config = await getAuthserviceConfig();

  // Update config based on event
  config = buildConfig(config, event);

  // Update the in-memory secret immediately
  setAuthserviceConfig(config);

  // unlock config
  log.info("Unlocking config for update");
  lock = false;

  log.info("Applying authservice secret");
  // apply the authservice secret
  await updateAuthServiceSecret(config);
}

export function buildConfig(config: AuthserviceConfig, event: AuthServiceEvent) {
  let chains: Chain[];

  if (event.action == Action.Add) {
    // Add the new chain to the existing authservice config
    chains = config.chains.filter(chain => chain.name !== event.name);
    chains = chains.concat(buildChain(event));
  } else if (event.action == Action.Remove) {
    // Search in the existing chains for the chain to remove by name
    chains = config.chains.filter(chain => chain.name !== event.name);
  } else {
    throw new Error(`Unhandled Action: ${event.action satisfies never}`);
  }

  // Add the new chains to the existing authservice config
  return { ...config, chains } as AuthserviceConfig;
}

export function buildChain(update: AuthServiceEvent) {
  // TODO: get this from the package
  // Parse the hostname from the first client redirect URI
  const hostname = new URL(update.client!.redirectUris[0]).hostname;

  const chain: Chain = {
    name: update.name,
    match: {
      header: ":authority",
      prefix: hostname,
    },
    filters: [
      {
        oidc_override: {
          authorization_uri: `https://sso.${UDSConfig.domain}/realms/${operatorConfig.realm}/protocol/openid-connect/auth`,
          token_uri: `https://sso.${UDSConfig.domain}/realms/${operatorConfig.realm}/protocol/openid-connect/token`,
          callback_uri: update.client!.redirectUris[0],
          client_id: update.client!.clientId,
          client_secret: update.client!.secret,
          scopes: [],
          logout: {
            path: "/logout",
            redirect_uri: `https://sso.${UDSConfig.domain}/realms/${operatorConfig.realm}/protocol/openid-connect/logout`,
          },
          cookie_name_prefix: update.client!.clientId,
        },
      },
    ],
  };
  return chain;
}
