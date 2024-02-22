import { K8s, Log, kind } from "pepr";
import { Action, AuthServiceEvent, AuthserviceConfig, Chain } from "./types";
import { createHash } from "crypto";

const namespace = "authservice";
const secretName = "authservice";

// write authservice config to secret
// TODO: support removal/syncing chains
// need to key everything by name (same name used in pepr store)
export async function updateConfig(event: AuthServiceEvent) {
  const authSvcSecret = await K8s(kind.Secret).InNamespace(namespace).Get(secretName);

  // parse existing authservice config
  let config = JSON.parse(atob(authSvcSecret!.data!["config.json"])) as AuthserviceConfig;

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
    chains = config.chains.concat(buildChain(event));
  } else {
    // search in the existing chains for the chain to remove by name
    chains = config.chains.filter(chain => chain.name !== event.name);
  }

  // add the new chains to the existing authservice config
  return { ...config, chains } as AuthserviceConfig;
}

export function buildChain(update: AuthServiceEvent) {
  const baseDomain = "https://sso.uds.dev";
  const realm = "uds";
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
