/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { describe, expect, it } from "vitest";
import {
  KEYCLOAK_CLIENT_SECRET_KEY,
  KEYCLOAK_CLIENTS_SECRET_NAME,
  KEYCLOAK_CLIENTS_SECRET_NAMESPACE,
  updateKeycloakClientsSecret,
} from "./client-secret-sync";

interface Config {
  metadata: {
    name: string;
    namespace: string;
  };
  data: {
    [key: string]: string;
  };
}

const createConfig = (data: { [key: string]: string } = {}): Config => ({
  metadata: {
    name: KEYCLOAK_CLIENTS_SECRET_NAME,
    namespace: KEYCLOAK_CLIENTS_SECRET_NAMESPACE,
  },
  data,
});

describe("updateKeycloakClientsSecret Tests", () => {
  it("should generate a new secret if KEYCLOAK_CLIENT_SECRET_KEY does not exist", async () => {
    const config = createConfig();

    await updateKeycloakClientsSecret(config);

    expect(config.data[KEYCLOAK_CLIENT_SECRET_KEY]).not.toBe("");
  });

  it("should generate a new secret if forceRotation is true", async () => {
    const config = createConfig({
      [KEYCLOAK_CLIENT_SECRET_KEY]: "existing-secret",
    });

    await updateKeycloakClientsSecret(config, true);

    expect(config.data[KEYCLOAK_CLIENT_SECRET_KEY]).not.toBe("");
    expect(config.data[KEYCLOAK_CLIENT_SECRET_KEY]).not.toBe("existing-secret");
  });

  it("should not generate a new secret if KEYCLOAK_CLIENT_SECRET_KEY exists and forceRotation is false", async () => {
    const config = createConfig({
      [KEYCLOAK_CLIENT_SECRET_KEY]: "existing-secret",
    });

    await updateKeycloakClientsSecret(config);

    expect(config.data[KEYCLOAK_CLIENT_SECRET_KEY]).toBe("existing-secret");
  });
});
