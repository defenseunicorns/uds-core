/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { createHash } from "crypto";
import { K8s, kind } from "pepr";

import { buildCABundleContent } from "../../ca-bundles/ca-bundle";
import { UDSConfig } from "../../config/config";
import { Client } from "../types";
import { buildChain, log } from "./authservice";
import { initializeOperatorConfig, operatorConfig } from "./shared/config";
import { setAuthserviceConfigManager } from "./shared/registry";
import { Action, AuthserviceConfig } from "./types";

// Export operatorConfig for test access
export { initializeOperatorConfig, operatorConfig };

let pendingSecretFetch: Promise<AuthserviceConfig> | null = null;

// Cache for in-memory secret to avoid unnecessary Kubernetes secret lookups
let inMemorySecret: AuthserviceConfig | null = null;

// Track pending package updates and their resolve functions
const pendingPackages: Map<
  AuthserviceConfig,
  { resolve: () => void; reject: (reason?: Error) => void }
> = new Map();

// Backup for the last known successful state of the secret
let lastSuccessfulSecret: AuthserviceConfig | null = null;

// Timer for debouncing updates to the secret
let debounceTimer: NodeJS.Timeout | null = null;

// Debounce duration (1 seconds) to reduce excessive updates, configurable via environment variable
const DEBOUNCE_DURATION = parseInt(process.env.DEBOUNCE_DURATION || "1000", 10);

/**
 * Fetches the authservice configuration from the Kubernetes secret
 *
 * @returns {AuthserviceConfig} The authservice configuration
 */
export async function fetchAuthserviceConfig(): Promise<AuthserviceConfig> {
  try {
    const secret = await K8s(kind.Secret)
      .InNamespace(operatorConfig.namespace)
      .Get(operatorConfig.secretName);

    const configData = secret.data?.["config.json"];
    if (!configData) {
      throw new Error("Authservice secret does not contain config.json");
    }

    const config = JSON.parse(atob(configData)) as AuthserviceConfig;
    return config;
  } catch (error) {
    log.error(error, "Failed to fetch authservice configuration");
    throw error;
  }
}

/**
 * Sets up the initial authservice secret in the Kubernetes cluster.
 * If in dev mode, it ensures the namespace exists and initializes
 * the secret if it does not already exist.
 */
export async function setupAuthserviceSecret() {
  if (process.env.PEPR_WATCH_MODE === "true" || process.env.PEPR_MODE === "dev") {
    initializeOperatorConfig();

    log.info("One-time authservice secret initialization");
    // Ensure the namespace exists in the Kubernetes cluster
    await K8s(kind.Namespace).Apply({
      metadata: {
        name: operatorConfig.namespace,
      },
    });

    // Create the secret if it doesn't exist
    try {
      const secret = await K8s(kind.Secret)
        .InNamespace(operatorConfig.namespace)
        .Get(operatorConfig.secretName);
      log.info(`Authservice Secret exists, skipping creation - ${secret.metadata?.name}`);
    } catch {
      log.info("Secret does not exist, creating authservice secret");
      try {
        // Build and create the initial secret configuration
        await updateAuthServiceSecret(buildInitialSecret(), false); // False to skip checksum on initial creation.
      } catch (err) {
        log.error(err, "Failed to create UDS managed authservice secret.");
        throw new Error("Failed to create UDS managed authservice secret.", { cause: err });
      }
    }
  }
}

/**
 * Builds the initial authservice configuration to be stored in the secret.
 * This config acts as a placeholder until the first chain is created.
 *
 * @returns {AuthserviceConfig} - The initial configuration for the authservice.
 */
export function buildInitialSecret(): AuthserviceConfig {
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
      trusted_certificate_authority: buildCABundleContent({
        certs: UDSConfig.caBundle.certs || "",
        includeDoDCerts: UDSConfig.caBundle.includeDoDCerts || false,
        includePublicCerts: UDSConfig.caBundle.includePublicCerts || false,
        dodCerts: UDSConfig.caBundle.dodCerts || "",
        publicCerts: UDSConfig.caBundle.publicCerts || "",
      }),
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
        action: Action.AddClient,
        client: {
          clientId: "placeholder",
          secret: "placeholder",
          redirectUris: ["https://localhost/login"],
        } as Client,
      }),
    ],
  };

  // Optionally add Redis session store configuration if provided
  if (UDSConfig.authserviceRedisUri) {
    config.default_oidc_config.redis_session_store_config = {
      server_uri: UDSConfig.authserviceRedisUri!,
    };
  }

  return config;
}

/**
 * Sets the in memory configuration for Authservce.
 *
 * @param config - The configuration object for Authservice.
 */
export function setAuthserviceConfig(config: AuthserviceConfig) {
  inMemorySecret = config;
}

/**
 * Retrieves the authservice configuration, either from the in-memory cache
 * or from the Kubernetes secret if not already cached.
 *
 * @returns {Promise<AuthserviceConfig>} - The authservice configuration.
 */
export async function getAuthserviceConfig(): Promise<AuthserviceConfig> {
  if (inMemorySecret) {
    log.info("Returning in-memory authservice secret");
    return Promise.resolve(inMemorySecret);
  }

  // Fetch the authservice secret from Kubernetes if not in cache
  // Null check is to prevent multiple concurrent fetches
  if (pendingSecretFetch === null) {
    pendingSecretFetch = K8s(kind.Secret)
      .InNamespace(operatorConfig.namespace)
      .Get(operatorConfig.secretName)
      .then(secret => {
        const config = JSON.parse(atob(secret.data!["config.json"])) as AuthserviceConfig;

        inMemorySecret = config;
        lastSuccessfulSecret = config;
        return config;
      })
      .finally(() => {
        pendingSecretFetch = null;
      });
  }

  return pendingSecretFetch;
}

/**
 * Update the authservice secret in memory and debounce the write to the Kubernetes cluster.
 * The in-memory secret is updated immediately, while the actual write to Kubernetes is debounced
 * to prevent excessive writes. Rollback is handled if the update fails.
 *
 * @param {AuthserviceConfig} authserviceConfig - The updated authservice configuration.
 * @param {boolean} [checksum=true] - Whether to add a checksum to the deployment after the update.
 */
export async function updateAuthServiceSecret(
  authserviceConfig: AuthserviceConfig,
  checksum = true,
): Promise<void> {
  return new Promise((resolve, reject) => {
    // Add the package config and its resolve function to the pending packages map
    pendingPackages.set(authserviceConfig, { resolve, reject });

    // Clear the previous debounce timer, if it exists
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    // Set a new debounce timer to apply the update after the delay
    debounceTimer = setTimeout(async () => {
      try {
        log.info(
          `Applying debounced secret update for packages: ${
            Array.from(pendingPackages.keys()).length
          } pending packages`,
        );

        // Prepare the config to be written (assumes that all packages share the same secret)
        const { base64EncodedConfig, hash } = encodeConfig(authserviceConfig!);

        // Apply the authservice config secret
        lastSuccessfulSecret = await applySecret(base64EncodedConfig);

        log.info(`Updated authservice secret successfully for all pending packages.`);

        // Apply the checksum if required
        if (checksum) {
          log.info(`Adding checksum to deployment for authservice secret`);
          await checksumDeployment(hash);
        }

        // Resolve the promises for all pending packages after the secret update
        pendingPackages.forEach(p => {
          p.resolve();
        });
      } catch (e) {
        log.error(e, `Failed to write authservice secret`);

        // Rollback to the last known successful state if the update fails
        inMemorySecret = lastSuccessfulSecret;
        log.info("Reverted to last successful secret state.");

        // Reject all promises for the pending packages on error
        pendingPackages.forEach(p => {
          p.reject(new Error(`Failed to write authservice secret for config`, { cause: e }));
        });
      } finally {
        // Clear pending packages on error
        pendingPackages.clear();

        // Reset debounce timer
        debounceTimer = null;
      }
    }, DEBOUNCE_DURATION);
  });
}

/**
 * Applies a checksum to the Kubernetes authservice deployment to force a rollout.
 *
 * @param {string} checksum - The checksum value to apply to the deployment.
 */
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
    log.error(e, `Failed to apply the checksum to authservice`);
    throw new Error("Failed to apply the checksum to authservice", { cause: e });
  }
}

/**
 * Applies a checksum to the Kubernetes authservice deployment to force a rollout.
 *
 * @param {string} base64EncodedConfig - The base64 encoded AuthserviceConfig to apply.
 */
async function applySecret(base64EncodedConfig: string) {
  try {
    return await K8s(kind.Secret)
      .Apply(
        {
          metadata: {
            namespace: operatorConfig.namespace,
            name: operatorConfig.secretName,
          },
          data: {
            "config.json": base64EncodedConfig,
          },
        },
        { force: true },
      )
      .then(secret => JSON.parse(atob(secret.data!["config.json"])) as AuthserviceConfig);
  } catch (e) {
    log.error(e, `Failed to apply the authservice config secret`);
    throw new Error("Failed to apply the authservice secret", { cause: e });
  }
}

/**
 * Encodes the authservice configuration and generates a hash for the configuration.
 *
 * @param {AuthserviceConfig} c - The authservice configuration to encode.
 * @returns {{ base64EncodedConfig: string, hash: string }} - The base64 encoded configuration and hash.
 */
function encodeConfig(c: AuthserviceConfig): { base64EncodedConfig: string; hash: string } {
  const config = btoa(JSON.stringify(c));
  const hash = createHash("sha256").update(config).digest("hex");

  return { base64EncodedConfig: config, hash };
}

// Register the config manager
setAuthserviceConfigManager({
  getAuthserviceConfig: async () => {
    if (inMemorySecret) {
      log.info("Returning in-memory authservice secret");
      return Promise.resolve(inMemorySecret);
    }

    if (pendingSecretFetch) {
      log.debug("Using pending authservice secret fetch");
      return pendingSecretFetch;
    }

    pendingSecretFetch = fetchAuthserviceConfig();
    return pendingSecretFetch;
  },
  setAuthserviceConfig: (config: AuthserviceConfig) => {
    inMemorySecret = config;
  },
  updateAuthServiceSecret: async (config: AuthserviceConfig, checksum = true) => {
    await updateAuthServiceSecret(config, checksum);
  },
});
