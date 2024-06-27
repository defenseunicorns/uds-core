import { createHash } from "crypto";

import { K8s, Log, kind } from "pepr";
import { UDSConfig } from "../../../../config";
import { Client } from "../types";
import { buildChain } from "./authservice";
import { Action, AuthserviceConfig } from "./types";

export const operatorConfig = {
  namespace: "authservice",
  secretName: "authservice-uds",
  baseDomain: `https://sso.${UDSConfig.domain}`,
  realm: "uds",
};

export async function setupAuthserviceSecret() {
  if (process.env.PEPR_WATCH_MODE === "true" || process.env.PEPR_MODE === "dev") {
    Log.info("One-time authservice secret initialization");
    // create namespace if it doesn't exist
    await K8s(kind.Namespace).Apply({
      metadata: {
        name: operatorConfig.namespace,
      },
    });

    // create secret if it doesn't exist
    try {
      const secret = await K8s(kind.Secret)
        .InNamespace(operatorConfig.namespace)
        .Get(operatorConfig.secretName);
      Log.info(`Authservice Secret exists, skipping creation - ${secret.metadata?.name}`);
    } catch (e) {
      Log.info("Secret does not exist, creating authservice secret");
      try {
        await updateAuthServiceSecret(buildInitialSecret(), false);
      } catch (err) {
        Log.error(err, "Failed to create UDS managed authservice secret.");
      }
    }
  }
}

// this initial secret is only a placeholder until the first chain is created
function buildInitialSecret(): AuthserviceConfig {
  return {
    allow_unmatched_requests: false,
    listen_address: "0.0.0.0",
    listen_port: "10003",
    log_level: "trace",
    default_oidc_config: {
      skip_verify_peer_cert: false,
      authorization_uri: `https://sso.${UDSConfig.domain}/realms/${operatorConfig.realm}/protocol/openid-connect/auth`,
      token_uri: `https://sso.${UDSConfig.domain}/realms/${operatorConfig.realm}/protocol/openid-connect/token`,
      jwks_fetcher: {
        jwks_uri: `https://sso.${UDSConfig.domain}/realms/${operatorConfig.realm}/protocol/openid-connect/certs`,
        periodic_fetch_interval_sec: 60,
        skip_verify_peer_cert: "false",
      },
      client_id: "global_id",
      client_secret: "global_secret",
      id_token: {
        preamble: "Bearer",
        header: "Authorization",
      },
      access_token: {
        header: "JWT",
      },
      trusted_certificate_authority: "",
      logout: {
        path: "/globallogout",
        redirect_uri: `https://sso.${UDSConfig.domain}/realms/${operatorConfig.realm}/protocol/openid-connect/token/logout`,
      },
      absolute_session_timeout: "0",
      idle_session_timeout: "0",
      scopes: [],
    },
    threads: 8,
    chains: [
      buildChain({
        name: "placeholder",
        action: Action.Add,
        client: {
          clientId: "placeholder",
          secret: "placeholder",
          redirectUris: ["https://localhost/login"],
        } as Client,
      }),
    ],
  };
}

export async function getAuthserviceConfig() {
  const authSvcSecret = await K8s(kind.Secret)
    .InNamespace(operatorConfig.namespace)
    .Get(operatorConfig.secretName);
  return JSON.parse(atob(authSvcSecret!.data!["config.json"])) as AuthserviceConfig;
}

export async function updateAuthServiceSecret(
  authserviceConfig: AuthserviceConfig,
  checksum = true,
) {
  const config = btoa(JSON.stringify(authserviceConfig));
  const configHash = createHash("sha256").update(config).digest("hex");

  try {
    // write the authservice config to the secret
    await K8s(kind.Secret).Apply(
      {
        metadata: {
          namespace: operatorConfig.namespace,
          name: operatorConfig.secretName,
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

  Log.info("Updated authservice secret successfully");

  if (checksum) {
    Log.info("Adding checksum to deployment authservice secret successfully");
    await checksumDeployment(configHash);
  }
}

async function checksumDeployment(checksum: string) {
  try {
    await K8s(kind.Deployment, { name: "authservice", namespace: operatorConfig.namespace }).Patch([
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
