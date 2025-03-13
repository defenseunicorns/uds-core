/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { K8s, kind } from "pepr";
import { v4 as uuidv4 } from "uuid";
import { Component, setupLogger } from "../../../logger";

const KEYCLOAK_CLIENT_SECRET_KEY = "uds-operator";

const log = setupLogger(Component.OPERATOR_CONFIG);

export async function updateKeycloakClientsSecret(config: kind.Secret) {
  config.data = config.data || {};

  // This might be a bug but it seems Zarf adds managedFields, which is prohibited in Secrets.
  delete config.metadata?.managedFields;

  if (!config.data[KEYCLOAK_CLIENT_SECRET_KEY]) {
    log.info("Generating new Keycloak client secret");
    config.data[KEYCLOAK_CLIENT_SECRET_KEY] = Buffer.from(uuidv4()).toString("base64");
    await K8s(kind.Secret).Apply(config);
  }
}
