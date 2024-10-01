import { createHash } from "crypto";
import { K8s, kind } from "pepr";
import { UDSConfig } from "../../../../config";
import { Client } from "../types";
import { buildChain, log } from "./authservice";
import { Action, AuthserviceConfig } from "./types";

let pendingSecretFetch: Promise<AuthserviceConfig> | null;

// Cache for in-memory secret to avoid unnecessary Kubernetes secret lookups
let inMemorySecret: AuthserviceConfig | null = null;

// Track pending package updates and their resolve functions
const pendingPackages: Map<AuthserviceConfig, () => void> = new Map();

// Backup for the last known successful state of the secret
let lastSuccessfulSecret: AuthserviceConfig | null = null;

// Timer for debouncing updates to the secret
let debounceTimer: NodeJS.Timeout | null = null;

// Debounce duration (12 seconds) to reduce excessive updates, configurable via environment variable
const DEBOUNCE_DURATION = parseInt(process.env.DEBONCE_DURATION || "1000", 10);

export const operatorConfig = {
  namespace: "authservice",
  secretName: "authservice-uds",
  baseDomain: `https://sso.${UDSConfig.domain}`,
  realm: "uds",
};

/**
 * Sets up the initial authservice secret in the Kubernetes cluster.
 * If in dev mode, it ensures the namespace exists and initializes
 * the secret if it does not already exist.
 */
export async function setupAuthserviceSecret() {
  if (process.env.PEPR_WATCH_MODE === "true" || process.env.PEPR_MODE === "dev") {
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
    } catch (e) {
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

  // Optionally add Redis session store configuration if provided
  if (UDSConfig.authserviceRedisUri) {
    config.default_oidc_config.redis_session_store_config = {
      server_uri: UDSConfig.authserviceRedisUri!,
    };
  }

  return config;
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
    return inMemorySecret;
  }

  // Fetch the authservice secret from Kubernetes if not in cache
  pendingSecretFetch = K8s(kind.Secret)
    .InNamespace(operatorConfig.namespace)
    .Get(operatorConfig.secretName)
    .then(secret => secret.data!["config.json"])
    .then(config => JSON.parse(atob(config)) as AuthserviceConfig)
    .then(config => {
      inMemorySecret = config;
      lastSuccessfulSecret = config;
      return config;
    })
    .finally(() => {
      pendingSecretFetch = null;
    });

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
    // Update the in-memory secret immediately
    inMemorySecret = authserviceConfig;

    // Add the package config and its resolve function to the pending packages map
    pendingPackages.set(authserviceConfig, resolve);

    // Clear the previous debounce timer, if it exists
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    // Set a new debounce timer to apply the update after the delay
    debounceTimer = setTimeout(async () => {
      try {
        log.info(
          `Applying debounced secret update for packages: ${Array.from(pendingPackages.keys()).length} pending packages`,
        );

        // Prepare the config to be written (assumes that all packages share the same secret)
        const config = btoa(JSON.stringify(inMemorySecret));
        const configHash = createHash("sha256").update(config).digest("hex");

        // Write the in-memory authservice config to the Kubernetes secret
        const appliedSecret = await K8s(kind.Secret).Apply(
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

        log.info(`Updated authservice secret successfully for all pending packages.`);

        // Apply the checksum if required
        if (checksum) {
          log.info(`Adding checksum to deployment for authservice secret`);
          await checksumDeployment(configHash);
        }

        // Resolve the promises for all pending packages after the secret update
        pendingPackages.forEach(resolveFunc => {
          resolveFunc();
        });

        lastSuccessfulSecret = JSON.parse(
          atob(appliedSecret.data!["config.json"]),
        ) as AuthserviceConfig;
      } catch (e) {
        log.error(e, `Failed to write authservice secret`);

        // Rollback to the last known successful state if the update fails
        inMemorySecret = lastSuccessfulSecret;
        log.info("Reverted to last successful secret state.");

        // Reject all promises for the pending packages on error
        pendingPackages.forEach(() => {
          reject(new Error(`Failed to write authservice secret for config`, { cause: e }));
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
    log.error(`Failed to apply the checksum to authservice: ${e.data?.message}`);
    throw new Error("Failed to apply the checksum to authservice", { cause: e });
  }
}
