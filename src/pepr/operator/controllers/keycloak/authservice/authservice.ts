import { R } from "pepr";
import { UDSConfig } from "../../../../config";
import { Component, setupLogger } from "../../../../logger";
import { UDSPackage } from "../../../crd";
import { getAuthserviceClients } from "../../utils";
import { Client } from "../types";
import { updatePolicy } from "./authorization-policy";
import { getAuthserviceConfig, operatorConfig, updateAuthServiceSecret } from "./config";
import { Action, AuthServiceEvent, AuthserviceConfig, Chain } from "./types";

export const log = setupLogger(Component.OPERATOR_AUTHSERVICE);

export async function authservice(pkg: UDSPackage, clients: Map<string, Client>) {
  // Get the list of clients from the package
  const authServiceClients = getAuthserviceClients(pkg);

  for (const sso of authServiceClients) {
    const client = clients.get(sso.clientId);
    if (!client) {
      throw new Error(`Failed to get client ${sso.clientId}`);
    }

    await reconcileAuthservice(
      { clientId: sso.clientId, action: Action.Add, client },
      sso.enableAuthserviceSelector!,
      pkg,
    );
  }

  const authserviceClientIds = authServiceClients.map(client => client.clientId);

  await purgeAuthserviceClients(pkg, authserviceClientIds);

  return authserviceClientIds;
}

export async function purgeAuthserviceClients(
  pkg: UDSPackage,
  newAuthserviceClients: string[] = [],
) {
  // compute set difference of pkg.status.authserviceClients and authserviceClients using Ramda
  R.difference(pkg.status?.authserviceClients || [], newAuthserviceClients).forEach(
    async clientId => {
      log.info(`Removing stale authservice chain for client ${clientId}`);
      await reconcileAuthservice({ clientId, action: Action.Remove }, {}, pkg);
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

// write authservice config to secret
export async function updateConfig(event: AuthServiceEvent) {
  // parse existing authservice config
  let config = await getAuthserviceConfig();

  // update config based on event
  config = buildConfig(config, event);

  // update the authservice secret
  await updateAuthServiceSecret(config);
}

export function buildConfig(config: AuthserviceConfig, event: AuthServiceEvent) {
  let chains: Chain[];

  if (event.action == Action.Add) {
    // add the new chain to the existing authservice config
    chains = config.chains.filter(chain => chain.name !== event.clientId);
    chains = chains.concat(buildChain(event));
  } else if (event.action == Action.Remove) {
    // search in the existing chains for the chain to remove by name
    chains = config.chains.filter(chain => chain.name !== event.clientId);
  } else {
    throw new Error(`Unhandled Action: ${event.action satisfies never}`);
  }

  // add the new chains to the existing authservice config
  return { ...config, chains } as AuthserviceConfig;
}

export function buildChain(update: AuthServiceEvent) {
  // TODO: get this from the package
  // parse the hostname from the first client redirect uri
  const hostname = new URL(update.client!.redirectUris[0]).hostname;

  const chain: Chain = {
    name: update.clientId,
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
