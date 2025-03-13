/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import {
  ClientCredentialsKeycloakClient,
  DynamicClientRegistrationClient,
  DynamicKeycloakClient,
} from "./keycloak-client";

describe("pickImplementation method", () => {
  it("should return DynamicClientRegistrationClient when ENV_KEYCLOAK_CLIENT_IMPLEMENTATION is dynamic_client_registration", async () => {
    process.env.PEPR_KEYCLOAK_CLIENT_STRATEGY =
      DynamicKeycloakClient.ENV_KEYCLOAK_CLIENT_IMPLEMENTATION_DYNAMIC;
    const client = new DynamicKeycloakClient("http://localhost");
    const implementation = await client.pickImplementation();
    expect(implementation).toBeInstanceOf(DynamicClientRegistrationClient);
  });

  it("should return ClientCredentialsKeycloakClient when ENV_KEYCLOAK_CLIENT_IMPLEMENTATION is client_credentials", async () => {
    process.env.PEPR_KEYCLOAK_CLIENT_STRATEGY =
      DynamicKeycloakClient.ENV_KEYCLOAK_CLIENT_IMPLEMENTATION_CLIENT_CREDENTIALS;
    const client = new DynamicKeycloakClient("http://localhost");
    const implementation = await client.pickImplementation();
    expect(implementation).toBeInstanceOf(ClientCredentialsKeycloakClient);
  });

  it("should fallback to DynamicClientRegistrationClient if ClientCredentialsKeycloakClient is not properly configured", async () => {
    delete process.env.PEPR_KEYCLOAK_CLIENT_STRATEGY;
    const client = new DynamicKeycloakClient("http://localhost");
    jest
      .spyOn(client["clientCredentialsKeycloakClient"], "getAccessToken")
      .mockImplementation(() => {
        throw new Error("Client Credentials Keycloak Client is not properly configured");
      });
    const implementation = await client.pickImplementation();
    expect(implementation).toBeInstanceOf(DynamicClientRegistrationClient);
  });

  it("should fallback use ClientCredentialsKeycloakClient if it is properly configured", async () => {
    delete process.env.PEPR_KEYCLOAK_CLIENT_STRATEGY;
    const client = new DynamicKeycloakClient("http://localhost");
    jest
      .spyOn(client["clientCredentialsKeycloakClient"], "getAccessToken")
      .mockImplementation(async () => {
        return Promise.resolve("mockAccessToken");
      });
    const implementation = await client.pickImplementation();
    expect(implementation).toBeInstanceOf(ClientCredentialsKeycloakClient);
  });

  it("should throw an error for invalid Keycloak Client implementation", async () => {
    process.env.PEPR_KEYCLOAK_CLIENT_STRATEGY = "invalid_strategy";
    const client = new DynamicKeycloakClient("http://localhost");
    await expect(client.pickImplementation()).rejects.toThrow(
      "Invalid Keycloak Client implementation: invalid_strategy. Supported values: dynamic_client_registration, client_credentials",
    );
  });
});
