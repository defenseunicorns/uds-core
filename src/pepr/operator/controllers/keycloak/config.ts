/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { K8s, kind } from "pepr";
import { Component, setupLogger } from "../../../logger.js";
import {
  KEYCLOAK_CLIENTS_SECRET_NAME,
  KEYCLOAK_CLIENTS_SECRET_NAMESPACE,
  updateKeycloakClientsSecret,
} from "./client-secret-sync.js";

export const log = setupLogger(Component.OPERATOR_KEYCLOAK);

export async function setupKeycloakClientSecret() {
  if (process.env.PEPR_WATCH_MODE === "true" || process.env.PEPR_MODE === "dev") {
    // Ensure the namespace exists in the Kubernetes cluster
    await K8s(kind.Namespace).Apply({
      metadata: {
        name: KEYCLOAK_CLIENTS_SECRET_NAMESPACE,
      },
    });

    // Create the secret if it doesn't exist
    try {
      await K8s(kind.Secret)
        .InNamespace(KEYCLOAK_CLIENTS_SECRET_NAMESPACE)
        .Get(KEYCLOAK_CLIENTS_SECRET_NAME);
      log.info(`Keycloak Clients Secret exists, skipping creation`);
    } catch {
      log.info("Keycloak Clients Secret does not exist, creating it");
      try {
        const secret = {
          metadata: {
            namespace: KEYCLOAK_CLIENTS_SECRET_NAMESPACE,
            name: KEYCLOAK_CLIENTS_SECRET_NAME,
          },
          type: "Opaque",
        };
        await updateKeycloakClientsSecret(secret, false);
      } catch (err) {
        log.error(err, "Failed to create Keycloak Clients Secret");
        throw err;
      }
    }
  }
}
