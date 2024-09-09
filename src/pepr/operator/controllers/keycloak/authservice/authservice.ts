import { R } from "pepr";
import { UDSConfig } from "../../../../config";
import { Component, setupLogger } from "../../../../logger";
import { UDSPackage } from "../../../crd";
import { Client } from "../types";
import { updatePolicy } from "./authorization-policy";
import {
  applyBatchedChecksumIfNeeded,
  getAuthserviceConfig,
  operatorConfig,
  updateAuthServiceSecret,
} from "./config";
import { Action, AuthServiceEvent, AuthserviceConfig, Chain } from "./types";

export const log = setupLogger(Component.OPERATOR_AUTHSERVICE);

/**
 * Main function to reconcile authservice clients based on the provided package.
 * Applies a batched checksum update at the end if any changes were made.
 */
export async function authservice(pkg: UDSPackage, clients: Map<string, Client>) {
  // Get the list of clients from the package that have authservice enabled
  const authServiceClients = R.filter(
    sso => R.isNotNil(sso.enableAuthserviceSelector),
    pkg.spec?.sso || [],
  );

  // Reconcile each client
  for (const sso of authServiceClients) {
    const client = clients.get(sso.clientId);
    if (!client) {
      throw new Error(`Failed to get client ${sso.clientId}`);
    }

    // Reconcile the authservice configuration for each client
    await reconcileAuthservice(
      { name: sso.clientId, action: Action.Add, client },
      sso.enableAuthserviceSelector!,
      pkg,
    );
  }

  const authserviceClients = authServiceClients.map(client => client.clientId);

  // Remove stale authservice clients that are no longer active
  await purgeAuthserviceClients(pkg, authserviceClients);

  // After processing all changes, apply the checksum once
  await applyBatchedChecksumIfNeeded();

  return authserviceClients;
}

/**
 * Removes stale authservice clients by computing the difference between the current and desired state.
 */
export async function purgeAuthserviceClients(
  pkg: UDSPackage,
  newAuthserviceClients: string[] = [],
) {
  // Compute the difference of pkg.status.authserviceClients and authserviceClients using Ramda
  R.difference(pkg.status?.authserviceClients || [], newAuthserviceClients).forEach(
    async clientId => {
      log.info(`Removing stale authservice chain for client ${clientId}`);
      await reconcileAuthservice({ name: clientId, action: Action.Remove }, {}, pkg);
    },
  );
}

/**
 * Reconciles the authservice configuration for a single client.
 */
export async function reconcileAuthservice(
  event: AuthServiceEvent,
  labelSelector: { [key: string]: string },
  pkg: UDSPackage,
) {
  await updateConfig(event); // Update the authservice configuration
  await updatePolicy(event, labelSelector, pkg); // Update the authorization policy
}

/**
 * Updates the authservice configuration in the Kubernetes secret.
 */
export async function updateConfig(event: AuthServiceEvent) {
  // Parse existing authservice config
  let config = await getAuthserviceConfig();

  // Update config based on the provided event
  config = buildConfig(config, event);

  // Update the authservice secret, without applying checksum immediately
  await updateAuthServiceSecret(config, false);
}

/**
 * Builds a new authservice configuration by adding or removing chains based on the event.
 */
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

/**
 * Builds a chain configuration object for a client to be added to the authservice configuration.
 */
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
            path: "/local",
            redirect_uri: `https://sso.${UDSConfig.domain}/realms/${operatorConfig.realm}/protocol/openid-connect/token/logout`,
          },
          cookie_name_prefix: update.client!.clientId,
        },
      },
    ],
  };
  return chain;
}
