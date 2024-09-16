import { createHash } from "crypto";
import { K8s, kind } from "pepr";
import { UDSConfig } from "../../../../config";
import { Client } from "../types";
import { buildChain, log } from "./authservice";
import { Action, AuthserviceConfig } from "./types";

// Operator configuration containing key settings for the namespace and secret management.
export const operatorConfig = {
  namespace: "authservice",
  secretName: "authservice-uds",
  baseDomain: `https://sso.${UDSConfig.domain}`,
  realm: "uds",
};

// Variables to track debounce state
let isDebounceScheduled = false;
const DEBOUNCE_INTERVAL = 3000;

/**
 * Function to set up the Authservice secret if it does not exist.
 * This function creates the necessary Kubernetes namespace and secret.
 */
export async function setupAuthserviceSecret() {
  if (process.env.PEPR_WATCH_MODE === "true" || process.env.PEPR_MODE === "dev") {
    log.info("One-time authservice secret initialization");

    // Create namespace if it doesn't exist. Assumes this will not throw an error if the namespace already exists.
    await K8s(kind.Namespace).Apply({
      metadata: {
        name: operatorConfig.namespace,
      },
    });

    // Attempt to retrieve the secret; if it doesn't exist, create it.
    try {
      const secret = await K8s(kind.Secret)
        .InNamespace(operatorConfig.namespace)
        .Get(operatorConfig.secretName);
      log.info(`Authservice Secret exists, skipping creation - ${secret.metadata?.name}`);
    } catch (e) {
      // Secret does not exist; create it using the initial secret configuration.
      log.info("Secret does not exist, creating authservice secret");
      try {
        updateAuthServiceSecret(buildInitialSecret(), false); // False to skip checksum on initial creation.
      } catch (err) {
        log.error(err, "Failed to create UDS managed authservice secret.");
        throw new Error("Failed to create UDS managed authservice secret.", { cause: err });
      }
    }
  }
}

/**
 * Builds the initial Authservice secret configuration.
 * This configuration is a placeholder until the first chain is created.
 * @returns {AuthserviceConfig} - The initial Authservice configuration.
 */
export function buildInitialSecret(): AuthserviceConfig {
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
 * Retrieves the current Authservice configuration from the Kubernetes secret.
 * @returns {Promise<AuthserviceConfig>} - The current Authservice configuration.
 */
export async function getAuthserviceConfig() {
  const authSvcSecret = await K8s(kind.Secret)
    .InNamespace(operatorConfig.namespace)
    .Get(operatorConfig.secretName);
  return JSON.parse(atob(authSvcSecret!.data!["config.json"])) as AuthserviceConfig;
}

/**
 * High-level function to handle Authservice secret update with debounce.
 * This prevents frequent updates within a short time span.
 * @param authserviceConfig {AuthserviceConfig} - The Authservice configuration to update.
 * @param checksum {boolean} - Whether to apply a checksum to the deployment after updating.
 */
export function updateAuthServiceSecret(authserviceConfig: AuthserviceConfig, checksum = true) {
  debounceUpdate(() => performAuthServiceSecretUpdate(authserviceConfig, checksum));
}

/**
 * Function to apply a checksum to the deployment to force a restart when configuration changes.
 * @param checksum {string} - The checksum to apply to the deployment.
 */
export async function checksumDeployment(checksum: string) {
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
 * Pure function to execute an update with debouncing.
 * Debouncing helps prevent multiple updates being triggered in a short period.
 * @param updateFn {() => Promise<void>} - The function to debounce.
 * @param interval {number} - The debounce interval in milliseconds.
 */
export function debounceUpdate(
  updateFn: () => Promise<void>,
  interval: number = DEBOUNCE_INTERVAL,
): void {
  if (!isDebounceScheduled) {
    isDebounceScheduled = true;

    setTimeout(async () => {
      try {
        await updateFn();
      } catch (error) {
        log.error("Error during update:", error);
      }

      // Reset the debounce flag after the update
      isDebounceScheduled = false;
    }, interval);
  }
}

/**
 * Function that contains only the logic of updating the Authservice secret.
 * @param authserviceConfig {AuthserviceConfig} - The configuration to apply.
 * @param checksum {boolean} - Whether to apply a checksum after updating.
 */
export async function performAuthServiceSecretUpdate(
  authserviceConfig: AuthserviceConfig,
  checksum: boolean = true,
) {
  const config = btoa(JSON.stringify(authserviceConfig));
  const configHash = createHash("sha256").update(config).digest("hex");

  try {
    // Write the authservice config to the secret
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
    log.info("Updated authservice secret successfully");
  } catch (e) {
    log.error(e, "Failed to write authservice secret");
    throw new Error("Failed to write authservice secret", { cause: e });
  }

  if (checksum) {
    log.info("Adding checksum to deployment authservice secret successfully");
    await checksumDeployment(configHash);
  }
}
