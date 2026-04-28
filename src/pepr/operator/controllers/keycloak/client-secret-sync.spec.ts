/**
 * Copyright 2025-2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { describe, expect, it, vi } from "vitest";

const applyMock = vi.fn().mockResolvedValue(undefined);

// Mock pepr K8s API
vi.mock("pepr", () => ({
  K8s: () => ({
    Apply: applyMock,
  }),
  kind: {
    Secret: "Secret",
  },
  Log: {
    child: vi.fn().mockReturnValue({
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
}));

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
    managedFields?: unknown[];
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
    applyMock.mockClear();
    const config = createConfig({
      [KEYCLOAK_CLIENT_SECRET_KEY]: "existing-secret",
    });

    await updateKeycloakClientsSecret(config);

    expect(config.data[KEYCLOAK_CLIENT_SECRET_KEY]).toBe("existing-secret");
    expect(applyMock).not.toHaveBeenCalled();
  });

  it("should handle config with undefined data", async () => {
    const config: Config = {
      metadata: {
        name: KEYCLOAK_CLIENTS_SECRET_NAME,
        namespace: KEYCLOAK_CLIENTS_SECRET_NAMESPACE,
      },
    } as Config;

    await updateKeycloakClientsSecret(config);

    expect(config.data).toBeDefined();
    expect(config.data[KEYCLOAK_CLIENT_SECRET_KEY]).toBeTruthy();
  });

  it("should not pass metadata.managedFields through to Apply", async () => {
    applyMock.mockClear();
    const config = createConfig();
    config.metadata.managedFields = [
      { manager: "kubectl", operation: "Update", apiVersion: "v1" },
    ];

    await updateKeycloakClientsSecret(config, true);

    expect(applyMock).toHaveBeenCalledTimes(1);
    const applied = applyMock.mock.calls[0][0];
    expect(applied.metadata.managedFields).toBeUndefined();
    expect(applied.metadata.name).toBe(KEYCLOAK_CLIENTS_SECRET_NAME);
    expect(applied.metadata.namespace).toBe(KEYCLOAK_CLIENTS_SECRET_NAMESPACE);
  });
});
