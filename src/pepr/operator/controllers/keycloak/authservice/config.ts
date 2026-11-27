/**
 * Copyright 2024-2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { createHash } from "crypto";
import { K8s, kind } from "pepr";

import { buildCABundleContent } from "../../ca-bundles/ca-bundle";
import { UDSConfig } from "../../config/config";
import { Client } from "../types";
import { buildChain, log } from "./authservice";
import { Action, AuthserviceConfig } from "./types";

let pendingSecretFetch: Promise<AuthserviceConfig> | null = null;

// Cache for in-memory secret to avoid unnecessary Kubernetes secret lookups
let inMemorySecret: AuthserviceConfig | null = null;

let pendingWrite: Promise<void> | undefined;
let previousWrite = Promise.resolve();

// Backup for the last known successful state of the secret
let lastSuccessfulSecret: AuthserviceConfig | null = null;

// Maximum batching delay when there is no write in progress.
const DEBOUNCE_DURATION = parseInt(process.env.DEBOUNCE_DURATION || "1000", 10);

export let operatorConfig: Record<string, string> = {};

export function initializeOperatorConfig() {
  operatorConfig = {
    namespace: "authservice",
    secretName: "authservice-uds",
    baseDomain: `https://sso.${UDSConfig.domain}`,
    realm: "uds",
  };

  log.info(operatorConfig, `Authservice operator config initialized`);
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
    try {
      const namespace = await K8s(kind.Namespace).Get(operatorConfig.namespace);
      log.debug(`Namespace ${namespace.metadata?.name} exists, skipping creation`);
    } catch (error) {
      if (error?.status !== 404) {
        throw error;
      }

      log.info(`Namespace ${operatorConfig.namespace} does not exist, creating it`);
      await K8s(kind.Namespace).Apply({
        metadata: {
          name: operatorConfig.namespace,
        },
      });
    }

    // Create the secret if it doesn't exist
    try {
      const secret = await K8s(kind.Secret)
        .InNamespace(operatorConfig.namespace)
        .Get(operatorConfig.secretName);
      log.info(`Authservice Secret exists, skipping creation - ${secret.metadata?.name}`);
    } catch (error) {
      if (error?.status !== 404) throw error;
      log.info("Secret does not exist, creating authservice secret");
      try {
        await K8s(kind.Secret).Create({
          metadata: { namespace: operatorConfig.namespace, name: operatorConfig.secretName },
          data: { "config.json": encodeConfig(buildInitialSecret()).base64EncodedConfig },
        });
      } catch (err) {
        if (err?.status === 409) return;
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
      trusted_certificate_authority: buildCABundleContent(),
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
 * Batch concurrent updates and resolve each caller after its Secret and checksum are applied.
 */
export function updateAuthServiceSecret(authserviceConfig: AuthserviceConfig): Promise<void> {
  inMemorySecret = authserviceConfig;
  if (pendingWrite) return pendingWrite;

  const delay = new Promise<void>(resolve => setTimeout(resolve, DEBOUNCE_DURATION));
  const promise = Promise.all([previousWrite, delay]).then(async () => {
    pendingWrite = undefined;
    try {
      const { base64EncodedConfig, hash } = encodeConfig(inMemorySecret!);
      lastSuccessfulSecret = await applySecret(base64EncodedConfig);
      await checksumDeployment(hash);
    } catch (e) {
      // A queued batch already contains the newer desired configuration.
      if (!pendingWrite) inMemorySecret = lastSuccessfulSecret;
      throw new Error("Failed to write authservice secret for config", { cause: e });
    }
  });
  pendingWrite = promise;
  // Each caller sees its own batch failure. The next batch can still retry.
  previousWrite = promise.catch(() => undefined);
  return promise;
}

/**
 * Applies a checksum to the Kubernetes authservice deployment to force a rollout.
 *
 * @param {string} checksum - The checksum value to apply to the deployment.
 */
async function checksumDeployment(checksum: string) {
  try {
    await K8s(kind.Deployment, { name: "authservice", namespace: operatorConfig.namespace }).Apply(
      {
        spec: {
          template: {
            metadata: {
              annotations: { "pepr.dev/checksum": checksum },
            },
          },
        },
      },
      { force: true },
    );

    log.info(`Successfully applied the checksum to authservice`);
  } catch (e) {
    log.error(e, `Failed to apply the checksum to authservice`);
    throw new Error("Failed to apply the checksum to authservice", { cause: e });
  }
}

/**
 * Applies the authservice configuration as a Kubernetes Secret.
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
