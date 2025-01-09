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
import {
  Action,
  AddOrRemoveClientEvent,
  AuthServiceEvent,
  AuthserviceConfig,
  Chain,
} from "./types";

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
      { name: sso.clientId, action: Action.AddClient, client },
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
      await reconcileAuthservice({ name: clientId, action: Action.RemoveClient }, {}, pkg);
    },
  );
}

function isAddOrRemoveClientEvent(event: AuthServiceEvent): event is AddOrRemoveClientEvent {
  return event.action === Action.AddClient || event.action === Action.RemoveClient;
}
export async function reconcileAuthservice(
  event: AuthServiceEvent,
  labelSelector: { [key: string]: string },
  pkg: UDSPackage,
) {
  await updateConfig(event);
  if (isAddOrRemoveClientEvent(event)) {
    await updatePolicy(event, labelSelector, pkg);
  }
}

// Write authservice config to secret (ensure the new function name is referenced)
export async function updateConfig(event: AuthServiceEvent) {
  // Lock to prevent concurrent updates
  if (lock) {
    log.debug("Lock is set for config update, retrying...");
    setTimeout(() => updateConfig(event), 0);
    return;
  }

  let config: AuthserviceConfig;

  try {
    log.debug("Locking config for update");
    lock = true;

    // build updated config based on event
    config = await getAuthserviceConfig().then(config => {
      return buildConfig(config, event);
    });

    // Update the in-memory config immediately
    setAuthserviceConfig(config);
  } catch (e) {
    log.error("Failed to build in memory authservice secret for event", event, e);
    throw e;
  } finally {
    // unlock config
    log.debug("Unlocking config for update");
    lock = false;
  }

  // apply the authservice secret
  log.debug("Applying authservice secret");
  await updateAuthServiceSecret(config);
}

export function buildConfig(config: AuthserviceConfig, event: AuthServiceEvent) {
  let chains: Chain[];

  if (event.action == Action.AddClient) {
    // Add the new chain to the existing authservice config
    chains = config.chains.filter(chain => chain.name !== event.name);
    chains = chains.concat(buildChain(event));
    // Sort the chains by their name before returning. Note that the accuracy of
    // sorting here is not relevant, only the consistency.
    const sortByName = R.sortBy(R.prop("name"));
    chains = sortByName(chains);
  } else if (event.action == Action.RemoveClient) {
    // Search in the existing chains for the chain to remove by name.
    // Filtering here should preserve the order, so there is no need to re-sort.
    chains = config.chains.filter(chain => chain.name !== event.name);
  } else if (event.action == Action.UpdateRedis) {
    if (event.redisUri === undefined) {
      // Remove the redis session store config if a URI is not provided
      delete config.default_oidc_config.redis_session_store_config;
    } else {
      // Update the redis session store config if a URI is provided
      config.default_oidc_config.redis_session_store_config!.server_uri = event.redisUri;
    }
    chains = config.chains;
  } else if (event.action == Action.UpdateCA) {
    if (event.trustedCA === undefined) {
      // Remove the trusted certificate authority if a CA is not provided
      delete config.default_oidc_config.trusted_certificate_authority;
    } else {
      // Update the trusted certificate authority if a CA is provided
      config.default_oidc_config.trusted_certificate_authority = event.trustedCA;
    }
    chains = config.chains;
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
