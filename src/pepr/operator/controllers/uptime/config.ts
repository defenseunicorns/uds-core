/**
 * Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { K8s, kind } from "pepr";
import { Component, setupLogger } from "../../../logger";
import { UDSConfig } from "../config/config";
import { Mutex } from "../utils";
import type { BlackboxConfig } from "./types";

const log = setupLogger(Component.OPERATOR_UPTIME);

// Mutex for serializing reads/writes to the shared blackbox exporter config secret
const blackboxConfigMutex = new Mutex();

export const BLACKBOX_CONFIG_SECRET_NAME = "uds-prometheus-blackbox-config";
export const BLACKBOX_CONFIG_NAMESPACE = "monitoring";
export const BLACKBOX_BASE_CONFIG: BlackboxConfig = {
  modules: {
    http_2xx: {
      prober: "http",
      timeout: "5s",
      http: {
        valid_http_versions: ["HTTP/1.1", "HTTP/2.0"],
        follow_redirects: true,
        preferred_ip_protocol: "ip4",
      },
    },
  },
};

/**
 * Updates the shared blackbox exporter config secret for a given namespace.
 * Removes all existing SSO modules scoped to the namespace, regenerates them
 * from the provided probe client credentials, and sorts all modules by name.
 * Module names follow the convention: http_200x_sso_<namespace>_<probe_client_id>
 *
 * @param namespace The k8s namespace of the UDS Package, used to scope module ownership
 * @param probeClients Probe client credentials to generate SSO modules from (pass in [] to remove all SSO modules for the namespace)
 */
export async function updateBlackboxConfig(
  namespace: string,
  probeClients: { clientId: string; secret: string }[],
): Promise<void> {
  // Acquire the mutex to ensure atomic read/modify/write of the shared config secret
  const release = await blackboxConfigMutex.acquire();

  try {
    // Read and parse the current config secret
    const secret = await K8s(kind.Secret)
      .InNamespace(BLACKBOX_CONFIG_NAMESPACE)
      .Get(BLACKBOX_CONFIG_SECRET_NAME);

    const currentConfig = JSON.parse(atob(secret.data!["blackbox.yaml"])) as BlackboxConfig;

    // Remove all existing SSO modules owned by this namespace
    const namespacePrefix = `http_200x_sso_${namespace}_`;
    const modules: BlackboxConfig["modules"] = Object.fromEntries(
      Object.entries(currentConfig.modules).filter(([name]) => !name.startsWith(namespacePrefix)),
    );

    const tokenUrl = `https://sso.${UDSConfig.domain}/realms/uds/protocol/openid-connect/token`;

    // Regenerate SSO modules for each probe client in this namespace
    for (const { clientId, secret: clientSecret } of probeClients) {
      modules[`http_200x_sso_${namespace}_${clientId}`] = {
        prober: "http",
        timeout: "5s",
        http: {
          valid_http_versions: ["HTTP/1.1", "HTTP/2.0"],
          preferred_ip_protocol: "ip4",
          follow_redirects: false,
          oauth2: {
            client_id: clientId,
            client_secret: clientSecret,
            token_url: tokenUrl,
            endpoint_params: {
              grant_type: "client_credentials",
            },
          },
        },
      };
    }

    // Sort all modules by name for deterministic output
    const sortedModules = Object.fromEntries(
      Object.entries(modules).sort(([a], [b]) => a.localeCompare(b)),
    );

    // Write the updated config back to the secret
    await K8s(kind.Secret).Apply(
      {
        metadata: {
          namespace: BLACKBOX_CONFIG_NAMESPACE,
          name: BLACKBOX_CONFIG_SECRET_NAME,
        },
        data: {
          "blackbox.yaml": btoa(JSON.stringify({ modules: sortedModules })),
        },
      },
      { force: true },
    );

    log.debug(
      `Updated blackbox config for namespace ${namespace} with ${probeClients.length} SSO module(s)`,
    );
  } finally {
    release();
  }
}

/**
 * Sets up the blackbox exporter config secret used for uptime monitoring.
 * If in dev/watch mode, ensures the monitoring namespace exists and creates
 * the secret if it does not already exist.
 */
export async function setupUptimeConfig() {
  if (process.env.PEPR_WATCH_MODE === "true" || process.env.PEPR_MODE === "dev") {
    log.info("One-time blackbox exporter config secret initialization");

    // Ensure the namespace exists in the Kubernetes cluster
    try {
      await K8s(kind.Namespace).Get(BLACKBOX_CONFIG_NAMESPACE);
      log.debug(`Namespace ${BLACKBOX_CONFIG_NAMESPACE} exists, skipping creation`);
    } catch {
      await K8s(kind.Namespace).Apply({
        metadata: {
          name: BLACKBOX_CONFIG_NAMESPACE,
        },
      });
    }

    // Create the secret if it doesn't exist
    try {
      const secret = await K8s(kind.Secret)
        .InNamespace(BLACKBOX_CONFIG_NAMESPACE)
        .Get(BLACKBOX_CONFIG_SECRET_NAME);
      log.debug(`Blackbox config secret exists, skipping creation - ${secret.metadata?.name}`);
    } catch {
      log.info("Blackbox config secret does not exist, creating it");
      await K8s(kind.Secret).Apply(
        {
          metadata: {
            namespace: BLACKBOX_CONFIG_NAMESPACE,
            name: BLACKBOX_CONFIG_SECRET_NAME,
          },
          data: {
            "blackbox.yaml": btoa(JSON.stringify(BLACKBOX_BASE_CONFIG)),
          },
        },
        { force: true },
      );
    }
  }
}
