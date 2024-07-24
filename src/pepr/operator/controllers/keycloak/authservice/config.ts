import { createHash } from "crypto";

import { K8s, kind } from "pepr";
import { UDSConfig } from "../../../../config";
import { Client } from "../types";
import { buildChain, log } from "./authservice";
import { Action, AuthserviceConfig } from "./types";

export const operatorConfig = {
  namespace: "authservice",
  secretName: "authservice-uds",
  baseDomain: `https://sso.${UDSConfig.domain}`,
  realm: "uds",
};

export async function setupAuthserviceSecret() {
  if (process.env.PEPR_WATCH_MODE === "true" || process.env.PEPR_MODE === "dev") {
    log.info("One-time authservice secret initialization");
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
      log.info(`Authservice Secret exists, skipping creation - ${secret.metadata?.name}`);
    } catch (e) {
      log.info("Secret does not exist, creating authservice secret");
      try {
        await updateAuthServiceSecret(buildInitialSecret(), false);
      } catch (err) {
        log.error(err, "Failed to create UDS managed authservice secret.");
        throw new Error("Failed to create UDS managed authservice secret.", { cause: err });
      }
    }
  }
}

// this initial secret is only a placeholder until the first chain is created
function buildInitialSecret(): AuthserviceConfig {
  const config: AuthserviceConfig = {
    allow_unmatched_requests: false,
    listen_address: "0.0.0.0",
    listen_port: "10003",
    log_level: "info",
    default_oidc_config: {
      skip_verify_peer_cert: false,
      authorization_uri: `https://sso.${UDSConfig.domain}/realms/${operatorConfig.realm}/protocol/openid-connect/auth`,
      token_uri: `https://sso.${UDSConfig.domain}/realms/${operatorConfig.realm}/protocol/openid-connect/token`,
      jwks_fetcher: {
        jwks_uri: `https://sso.${UDSConfig.domain}/realms/${operatorConfig.realm}/protocol/openid-connect/certs`,
        periodic_fetch_interval_sec: 60,
      },
      client_id: "global_id",
      client_secret: "global_secret",
      id_token: {
        preamble: "Bearer",
        header: "Authorization",
      },
      trusted_certificate_authority: `${atob(UDSConfig.caCert)}`,
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

  if (UDSConfig.authserviceRedisUri) {
    config.default_oidc_config.redis_session_store_config = {
      server_uri: UDSConfig.authserviceRedisUri!,
    };
  }

  return config;
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
    log.error(e, `Failed to write authservice secret`);
    throw new Error("Failed to write authservice secret", { cause: e });
  }

  log.info("Updated authservice secret successfully");

  if (checksum) {
    log.info("Adding checksum to deployment authservice secret successfully");
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

    log.info(`Successfully applied the checksum to authservice`);
  } catch (e) {
    log.error(`Failed to apply the checksum to authservice: ${e.data?.message}`);
    throw new Error("Failed to apply the checksum to authservice", { cause: e });
  }
}
