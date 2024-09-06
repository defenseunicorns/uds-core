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

// Tracks if there are changes that require a batched checksum update.
let changesPending = false;

/**
 * Initializes the authservice secret in Kubernetes if it does not exist.
 * This function is called during setup to ensure the necessary Kubernetes objects are present.
 */
export async function setupAuthserviceSecret() {
  if (process.env.PEPR_WATCH_MODE === "true" || process.env.PEPR_MODE === "dev") {
    log.info("One-time authservice secret initialization");

    // Ensure the namespace exists
    await K8s(kind.Namespace).Apply({
      metadata: {
        name: operatorConfig.namespace,
      },
    });

    // Ensure the authservice secret exists, creating it if necessary
    try {
      const secret = await K8s(kind.Secret)
        .InNamespace(operatorConfig.namespace)
        .Get(operatorConfig.secretName);
      log.info(`Authservice Secret exists, skipping creation - ${secret.metadata?.name}`);
    } catch (e) {
      log.info("Secret does not exist, creating authservice secret");
      try {
        await updateAuthServiceSecret(buildInitialSecret(), false); // Skip immediate checksum
      } catch (err) {
        log.error(err, "Failed to create UDS managed authservice secret.");
        throw new Error("Failed to create UDS managed authservice secret.", { cause: err });
      }
    }
  }
}

/**
 * Builds an initial placeholder secret for the authservice. This is used until the first real chain is created.
 */
function buildInitialSecret(): AuthserviceConfig {
  const config: AuthserviceConfig = {
    // Basic authservice configuration
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

  // Add Redis configuration if available
  if (UDSConfig.authserviceRedisUri) {
    config.default_oidc_config.redis_session_store_config = {
      server_uri: UDSConfig.authserviceRedisUri!,
    };
  }

  return config;
}

/**
 * Retrieves the current authservice configuration from the Kubernetes secret.
 */
export async function getAuthserviceConfig() {
  const authSvcSecret = await K8s(kind.Secret)
    .InNamespace(operatorConfig.namespace)
    .Get(operatorConfig.secretName);
  return JSON.parse(atob(authSvcSecret!.data!["config.json"])) as AuthserviceConfig;
}

/**
 * Updates the authservice secret in Kubernetes with the new configuration.
 * Optionally, applies a checksum to the deployment immediately or defers it.
 */
export async function updateAuthServiceSecret(
  authserviceConfig: AuthserviceConfig,
  applyChecksum = false,
) {
  const config = btoa(JSON.stringify(authserviceConfig));
  const configHash = createHash("sha256").update(config).digest("hex");

  try {
    // Write the updated config to the Kubernetes secret
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

  if (applyChecksum) {
    // Apply the checksum immediately
    await applyChecksumToDeployment(configHash);
  } else {
    // Mark a pending change for a batched checksum update
    changesPending = true;
  }
}

/**
 * Applies a checksum annotation to the authservice deployment to trigger a restart.
 */
async function applyChecksumToDeployment(checksum: string) {
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

/**
 * Applies the checksum to the deployment if there are pending changes.
 * This function is called at the end of processing a batch of changes.
 */
export async function applyBatchedChecksumIfNeeded() {
  if (changesPending) {
    try {
      const config = await getAuthserviceConfig();
      const configStr = JSON.stringify(config);
      const configHash = createHash("sha256").update(configStr).digest("hex");

      await applyChecksumToDeployment(configHash); // Apply the checksum
      changesPending = false; // Reset the flag after applying
      log.info("Batched checksum applied successfully.");
    } catch (e) {
      log.error(`Failed to batch apply checksum: ${e}`);
    }
  }
}
