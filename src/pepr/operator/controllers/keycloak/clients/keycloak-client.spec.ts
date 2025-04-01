/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { ClientStrategy, createOrUpdateClient, getStrategy } from "./keycloak-client";
import { credentialsGetAccessToken } from "./client-credentials";
import { dynamicCreateOrUpdate } from "./dynamic-client-registration";

jest.mock("./dynamic-client-registration");
jest.mock("./client-credentials");
jest.mock("./common");

describe("Test picking proper strategy", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.PEPR_KEYCLOAK_CLIENT_STRATEGY;
  });

  it('should return "client_credentials" if PEPR_KEYCLOAK_CLIENT_STRATEGY is set to "client_credentials"', async () => {
    process.env.PEPR_KEYCLOAK_CLIENT_STRATEGY = "client_credentials";
    const strategy = await getStrategy();
    expect(strategy).toBe(ClientStrategy.CLIENT_CREDENTIALS);
  });

  it('should return "client_credentials" if PEPR_KEYCLOAK_CLIENT_STRATEGY is set to "auto" and credentialsGetAccessToken succeeds', async () => {
    process.env.PEPR_KEYCLOAK_CLIENT_STRATEGY = "auto";
    (credentialsGetAccessToken as jest.Mock).mockResolvedValue("token");
    const strategy = await getStrategy();
    expect(strategy).toBe(ClientStrategy.CLIENT_CREDENTIALS);
  });

  it('should return "dynamic" if PEPR_KEYCLOAK_CLIENT_STRATEGY is set to "auto" and credentialsGetAccessToken fails', async () => {
    process.env.PEPR_KEYCLOAK_CLIENT_STRATEGY = "auto";
    (credentialsGetAccessToken as jest.Mock).mockRejectedValue(new Error("error"));
    const strategy = await getStrategy();
    expect(strategy).toBe(ClientStrategy.DYNAMIC_CLIENT_REGISTRATION);
  });

  it('should return "dynamic" if PEPR_KEYCLOAK_CLIENT_STRATEGY is set to an invalid value', async () => {
    process.env.PEPR_KEYCLOAK_CLIENT_STRATEGY = "invalid_value";
    const strategy = await getStrategy();
    expect(strategy).toBe(ClientStrategy.DYNAMIC_CLIENT_REGISTRATION);
  });

  it('should return "client_credentials" if PEPR_KEYCLOAK_CLIENT_STRATEGY is not set and credentialsGetAccessToken succeeds', async () => {
    (credentialsGetAccessToken as jest.Mock).mockResolvedValue("token");
    const strategy = await getStrategy();
    expect(strategy).toBe("client_credentials");
  });

  it('should return "dynamic" if PEPR_KEYCLOAK_CLIENT_STRATEGY is not set and credentialsGetAccessToken fails', async () => {
    (credentialsGetAccessToken as jest.Mock).mockRejectedValue(new Error("error"));
    const strategy = await getStrategy();
    expect(strategy).toBe(ClientStrategy.DYNAMIC_CLIENT_REGISTRATION);
  });
});

describe("Test createOrUpdateClient function", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.PEPR_KEYCLOAK_CLIENT_STRATEGY;
  });

  it("should call dynamicCreateOrUpdate with isRetry set to true", async () => {
    process.env.PEPR_KEYCLOAK_CLIENT_STRATEGY = "dynamic_client_registration";
    const client = { clientId: "test-client" };
    await createOrUpdateClient(client, true);
    expect(dynamicCreateOrUpdate).toHaveBeenCalledWith(client, true);
  });
});
