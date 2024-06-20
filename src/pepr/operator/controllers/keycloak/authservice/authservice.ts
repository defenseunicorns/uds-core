import { createHash } from "crypto";
import { K8s, Log, R, kind } from "pepr";
import { UDSConfig } from "../../../../config";
import { Store } from "../../../common";
import { UDSPackage } from "../../../crd";
import { apiCall } from "../client-sync";
import { Client } from "../types";
import { updatePolicy } from "./authorization-policy";
import { Action, AuthServiceEvent, AuthserviceConfig, Chain } from "./types";

const namespace = "authservice";
const secretName = "authservice";
const baseDomain = `https://sso.${UDSConfig.domain}`;
const realm = "uds";

export async function authservice(pkg: UDSPackage) {
  // Get the list of clients from the package
  const authServiceClients = R.filter(
    sso => R.isNotNil(sso.enableAuthserviceSelector),
    pkg.spec?.sso || [],
  );

  for (const client of authServiceClients) {
    const name = `sso-client-${client.clientId}`;
    const token = Store.getItem(name);
    if (!token) {
      throw new Error(`Failed to get token for client ${client.clientId}`);
    }
    const keycloakClient = await apiCall(client, "GET", token);
    await Store.setItemAndWait(name, keycloakClient.registrationAccessToken!);

    client.secret = keycloakClient.secret;
    await reconcileAuthservice(
      { name: client.clientId, action: Action.Add, client: client as unknown as Client },
      client.enableAuthserviceSelector as { [key: string]: string },
      pkg,
    );
  }

  const authserviceClients = authServiceClients.map(client => client.clientId);

  await purgeAuthserviceClients(pkg, authserviceClients);

  return authserviceClients;
}

export async function purgeAuthserviceClients(pkg: UDSPackage, authserviceClients: string[] = []) {
  // compute set difference of pkg.status.authserviceClients and authserviceClients using Ramda
  R.difference(pkg.status?.authserviceClients || [], authserviceClients).forEach(async clientId => {
    Log.info(`Removing stale authservice chain for client ${clientId}`);
    await reconcileAuthservice({ name: clientId, action: Action.Remove }, {}, pkg);
  });
}

export async function reconcileAuthservice(
  event: AuthServiceEvent,
  labelSelector: { [key: string]: string },
  pkg: UDSPackage,
) {
  await updateConfig(event);
  await updatePolicy(event, labelSelector, pkg);
}

async function getAuthserviceConfig() {
  const authSvcSecret = await K8s(kind.Secret).InNamespace(namespace).Get(secretName);
  return JSON.parse(atob(authSvcSecret!.data!["config.json"])) as AuthserviceConfig;
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

// might be neccesary to rebuild the entire config
export function buildConfig(config: AuthserviceConfig, event: AuthServiceEvent) {
  let chains: Chain[];

  if (event.action == Action.Add) {
    // add the new chain to the existing authservice config
    chains = config.chains.filter(chain => chain.name !== event.name);
    chains = chains.concat(buildChain(event));
  } else {
    // search in the existing chains for the chain to remove by name
    chains = config.chains.filter(chain => chain.name !== event.name);
  }

  // add the new chains to the existing authservice config
  return { ...config, chains } as AuthserviceConfig;
}

export function buildChain(update: AuthServiceEvent) {
  // TODO: get this from the package
  // parse the hostname from the first client redirect uri
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
          authorization_uri: `${baseDomain}/realms/${realm}/protocol/openid-connect/auth`,
          token_uri: `${baseDomain}/realms/${realm}/protocol/openid-connect/token`,
          callback_uri: update.client!.redirectUris[0],
          client_id: update.client!.clientId,
          client_secret: update.client!.secret,
          scopes: [],
          logout: {
            path: "/local",
            redirect_uri: `${baseDomain}/realms/${realm}/protocol/openid-connect/token/logout`,
          },
          skip_verify_peer_cert: true,
          id_token: {
            header: "Authorization",
          },
        },
      },
    ],
  };
  return chain;
}

async function updateAuthServiceSecret(authserviceConfig: AuthserviceConfig) {
  const config = btoa(JSON.stringify(authserviceConfig));
  const configHash = createHash("sha256").update(config).digest("hex");

  try {
    // write the authservice config to the secret
    await K8s(kind.Secret).Apply(
      {
        metadata: {
          namespace,
          name: secretName,
        },
        data: {
          "config.json": config,
        },
      },
      { force: true },
    );
  } catch (e) {
    Log.error(e, `Failed to write authservice secret`);
  }

  Log.info("Updated authservice secret succesfully");
  await checksumDeployment(configHash);
}

async function checksumDeployment(checksum: string) {
  try {
    await K8s(kind.Deployment, { name: "authservice", namespace }).Patch([
      {
        op: "add",
        path: "/spec/template/metadata/annotations/pepr.dev~1checksum",
        value: checksum,
      },
    ]);

    Log.info(`Successfully applied the checksum to authservice`);
  } catch (e) {
    Log.error(`Failed to apply the checksum to authservice: ${e.data?.message}`);
  }
}
