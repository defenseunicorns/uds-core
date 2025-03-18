/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { Client } from "./types";
import { fetch, K8s, kind } from "pepr";
import { Store } from "../../common";
import { retryWithDelay } from "../utils";
import { Component, setupLogger } from "../../../logger";
import { FetchResponse } from "kubernetes-fluent-client/src/fetch";
import { decodeJwt } from "jose";

const log = setupLogger(Component.OPERATOR_KEYCLOAK);

/**
 * Interface for Keycloak client operations
 */
export interface KeycloakClient {
  /**
   * Creates a new client in Keycloak
   * @param client The client configuration to create
   * @returns The created client details
   */
  create(client: Partial<Client>): Promise<Client>;

  /**
   * Updates an existing client in Keycloak
   * @param client The client configuration to update
   * @returns The updated client details
   */
  update(client: Partial<Client>): Promise<Client>;

  /**
   * Deletes a client from Keycloak
   * @param client The client configuration to update
   * @returns void
   */
  delete(client: Partial<Client>): Promise<void>;

  /**
   * Creates or updates a client in Keycloak
   * If the client already exists, it updates the client; otherwise, it creates a new one
   * @param client The client configuration to be created or updated
   * @returns The created or updated client details
   */
  createOrUpdate(client: Partial<Client>): Promise<Client>;
}

/**
 * Dynamic Keycloak Client implementation that chooses between different Keycloak client implementations
 */
export class DynamicKeycloakClient implements KeycloakClient {
  public static readonly ENV_KEYCLOAK_CLIENT_IMPLEMENTATION = "PEPR_KEYCLOAK_CLIENT_STRATEGY";
  public static readonly ENV_KEYCLOAK_CLIENT_IMPLEMENTATION_DYNAMIC = "dynamic_client_registration";
  public static readonly ENV_KEYCLOAK_CLIENT_IMPLEMENTATION_CLIENT_CREDENTIALS =
    "client_credentials";
  public static readonly ENV_KEYCLOAK_CLIENT_IMPLEMENTATION_AUTO = "auto";

  private readonly dynaamicClientRegistrationKeycloakClient: DynamicClientRegistrationClient;
  private readonly clientCredentialsKeycloakClient: ClientCredentialsKeycloakClient;

  constructor(baseUrl: string) {
    this.dynaamicClientRegistrationKeycloakClient = new DynamicClientRegistrationClient(baseUrl);
    this.clientCredentialsKeycloakClient = new ClientCredentialsKeycloakClient(baseUrl);
  }

  async pickImplementation() {
    const implementation =
      process.env[DynamicKeycloakClient.ENV_KEYCLOAK_CLIENT_IMPLEMENTATION] ??
      DynamicKeycloakClient.ENV_KEYCLOAK_CLIENT_IMPLEMENTATION_AUTO;
    switch (implementation) {
      case DynamicKeycloakClient.ENV_KEYCLOAK_CLIENT_IMPLEMENTATION_DYNAMIC:
        return this.dynaamicClientRegistrationKeycloakClient;
      case DynamicKeycloakClient.ENV_KEYCLOAK_CLIENT_IMPLEMENTATION_CLIENT_CREDENTIALS:
        return this.clientCredentialsKeycloakClient;
      case DynamicKeycloakClient.ENV_KEYCLOAK_CLIENT_IMPLEMENTATION_AUTO:
        try {
          log.info("Probing Client Credentials Keycloak Client implementation...");
          await this.clientCredentialsKeycloakClient.getAccessToken();
          log.info("Client Credentials Keycloak Client is available");
          return this.clientCredentialsKeycloakClient;
        } catch {
          log.info(
            "Client Credentials Keycloak Client is not properly configured, falling back to Dynamic Client Registration...",
          );
          return this.dynaamicClientRegistrationKeycloakClient;
        }
      default:
        throw new Error(
          `Invalid Keycloak Client implementation: ${implementation}. Supported values: ${DynamicKeycloakClient.ENV_KEYCLOAK_CLIENT_IMPLEMENTATION_DYNAMIC}, ${DynamicKeycloakClient.ENV_KEYCLOAK_CLIENT_IMPLEMENTATION_CLIENT_CREDENTIALS}`,
        );
    }
  }

  async create(client: Partial<Client>): Promise<Client> {
    return (await this.pickImplementation()).create(client);
  }

  async update(client: Partial<Client>): Promise<Client> {
    return (await this.pickImplementation()).update(client);
  }

  async delete(client: Partial<Client>): Promise<void> {
    return (await this.pickImplementation()).delete(client);
  }

  async createOrUpdate(client: Partial<Client>): Promise<Client> {
    return (await this.pickImplementation()).createOrUpdate(client);
  }
}

/**
 * Implementation of KeycloakClient using Dynamic Client Registration
 */
export class DynamicClientRegistrationClient implements KeycloakClient {
  private readonly dynamicClientRegistrationUrl: string;

  constructor(baseUrl: string) {
    this.dynamicClientRegistrationUrl = baseUrl + "/realms/uds/clients-registrations/default";
  }

  async createOrUpdate(client: Partial<Client>): Promise<Client> {
    const registrationTokenStoreKey = `sso-client-${client.clientId}`;
    const registrationToken = Store.getItem(registrationTokenStoreKey) as string;

    if (registrationToken) {
      return this.update(client);
    }
    return this.create(client);
  }

  async create(client: Partial<Client>): Promise<Client> {
    log.info(`DynamicClientRegistrationClient: creating client ${JSON.stringify(client)}`);
    const response = await fetch<Client>(this.dynamicClientRegistrationUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(client),
    });

    throwErrorIfNeeded(response);
    await this.updateRegistrationTokenInStore(response.data);

    return response.data;
  }

  async update(client: Partial<Client>): Promise<Client> {
    log.info(`DynamicClientRegistrationClient: updating client ${JSON.stringify(client)}`);
    const registrationToken = Store.getItem(`sso-client-${client.clientId}`) as string;

    const url = `${this.dynamicClientRegistrationUrl}/${encodeURIComponent(client.clientId!)}`;
    const response = await fetch<Client>(url, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${registrationToken}`,
      },
      body: JSON.stringify(client),
    });

    throwErrorIfNeeded(response);
    await this.updateRegistrationTokenInStore(response.data);

    return response.data;
  }

  async delete(client: Partial<Client>): Promise<void> {
    log.info(`DynamicClientRegistrationClient: updating client ${JSON.stringify(client)}`);
    const registrationToken = Store.getItem(`sso-client-${client.clientId}`) as string;

    const url = `${this.dynamicClientRegistrationUrl}/${encodeURIComponent(client.clientId!)}`;
    const response = await fetch<Client>(url, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${registrationToken}`,
      },
    });

    throwErrorIfNeeded(response);
    await this.updateRegistrationTokenInStore(client, true);
  }

  private async updateRegistrationTokenInStore(
    client: Partial<Client>,
    deleteStoreKey: boolean = false,
  ) {
    log.info(`DynamicClientRegistrationClient: updating store ${JSON.stringify(client)}`);
    try {
      const registrationTokenStoreKey = `sso-client-${client.clientId}`;
      await retryWithDelay(async function setStoreToken() {
        if (deleteStoreKey) {
          await Store.removeItemAndWait(registrationTokenStoreKey);
        } else {
          await Store.setItemAndWait(registrationTokenStoreKey, client.registrationAccessToken!);
        }
      }, log);
    } catch {
      throw Error(`Failed to remove token from store for client '${client.clientId}'`);
    }
  }
}

/**
 * Implementation of KeycloakClient using Client Credentials Grant
 */
export class ClientCredentialsKeycloakClient implements KeycloakClient {
  private static readonly TOKEN_EXPIRATION_OFFSET_IN_S = 5;
  private static readonly KEYCLOAK_CLINETS_SECRET_NAMESPACE = "keycloak";
  private static readonly KEYCLOAK_CLINETS_SECRET = "keycloak-client-secrets";
  private static readonly UDS_OPERATOR_CLIENT_ID = "uds-operator";

  private readonly clientCredentialsUrl: string;
  private readonly clientsAdminUrl: string;

  private cachedToken: string | null = null;

  constructor(baseUrl: string) {
    this.clientsAdminUrl = baseUrl + "/admin/realms/uds/clients";
    this.clientCredentialsUrl = baseUrl + "/realms/uds/protocol/openid-connect/token";
  }

  public async getAccessToken() {
    log.info(`ClientCredentialsKeycloakClient: getting token`);
    if (this.cachedToken) {
      const jwt = decodeJwt(this.cachedToken);
      if (jwt.exp) {
        const tokenMaxExpirationDate =
          Math.floor(Date.now() / 1000) +
          ClientCredentialsKeycloakClient.TOKEN_EXPIRATION_OFFSET_IN_S;
        log.debug(
          `Max token expiration date: ${tokenMaxExpirationDate}, current time: ${Date.now() / 1000}, token expiration: ${jwt.exp}`,
        );
        if (jwt.exp > tokenMaxExpirationDate) {
          // The Token will expire in more than 5 seconds - let's reuse it
          log.debug(`Reusing previously obtained token`);
          return this.cachedToken;
        }
      }
    }

    const keycloakClientsSecret = await K8s(kind.Secret)
      .InNamespace(ClientCredentialsKeycloakClient.KEYCLOAK_CLINETS_SECRET_NAMESPACE)
      .Get(ClientCredentialsKeycloakClient.KEYCLOAK_CLINETS_SECRET);
    if (!keycloakClientsSecret) {
      throw new Error(
        `The ${ClientCredentialsKeycloakClient.KEYCLOAK_CLINETS_SECRET} secret does not exist in the ${ClientCredentialsKeycloakClient.KEYCLOAK_CLINETS_SECRET_NAMESPACE} namespace.`,
      );
    }
    const udsOperatorClientSecret =
      keycloakClientsSecret.data?.[ClientCredentialsKeycloakClient.UDS_OPERATOR_CLIENT_ID] ?? "";
    if (!udsOperatorClientSecret) {
      throw new Error(
        `The ${ClientCredentialsKeycloakClient.KEYCLOAK_CLINETS_SECRET} doesn't contain the ${ClientCredentialsKeycloakClient.UDS_OPERATOR_CLIENT_ID} key.`,
      );
    }

    const clientSecret = Buffer.from(udsOperatorClientSecret, "base64").toString("utf-8");

    const params = new URLSearchParams();
    params.append("grant_type", "client_credentials");
    params.append("client_id", ClientCredentialsKeycloakClient.UDS_OPERATOR_CLIENT_ID);
    params.append("client_secret", clientSecret);

    interface KeycloakAccessTokenResponse {
      access_token: string;
    }

    const response = await fetch<KeycloakAccessTokenResponse>(this.clientCredentialsUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });
    throwErrorIfNeeded(response);

    const accessToken = response.data.access_token;
    this.validateAccessToken(accessToken);
    this.cachedToken = accessToken;
    return this.cachedToken;
  }

  validateAccessToken(accessToken: string) {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const jwt = decodeJwt(accessToken) as Record<string, any>;
    const roles: string[] = jwt["resource_access"]["realm-management"]["roles"] ?? [];
    if (!roles.includes("manage-clients")) {
      throw new Error("The provided token does not have the manage-clients role");
    }
  }

  async create(client: Partial<Client>): Promise<Client> {
    log.info(`ClientCredentialsKeycloakClient: creating client ${JSON.stringify(client)}`);
    const accessToken = await this.getAccessToken();
    const url = `${this.clientsAdminUrl}`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(client),
    });

    throwErrorIfNeeded(response);
    return await this.get(client);
  }

  async get(client: Partial<Client>): Promise<ClientWithId> {
    log.info(`ClientCredentialsKeycloakClient: getting client ${JSON.stringify(client)}`);
    const accessToken = await this.getAccessToken();
    // Keycloak doesn't support finding specific client by client_id. It supports this in the collection endpoint.
    const url = `${this.clientsAdminUrl}?clientId=${encodeURIComponent(client.clientId!)}`;
    const response = await fetch<ClientWithId[]>(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    });
    throwErrorIfNeeded(response);
    return response.data[0];
  }

  async update(
    client: Partial<Client>,
    preciouslyObtainedClient: ClientWithId | null = null,
  ): Promise<Client> {
    log.info(`ClientCredentialsKeycloakClient: updating client ${JSON.stringify(client)}`);
    const accessToken = await this.getAccessToken();
    // The update endpoint accepts Client.id (not client_id). We need to obtain a new client first
    const obtainedClient = preciouslyObtainedClient || (await this.get(client));

    const url = `${this.clientsAdminUrl}/${encodeURIComponent(obtainedClient.id!)}`;
    const response = await fetch(url, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(client),
    });

    throwErrorIfNeeded(response);
    return await this.get(client);
  }

  async delete(client: Partial<Client>): Promise<void> {
    log.info(`ClientCredentialsKeycloakClient: deleting client ${JSON.stringify(client)}`);
    // The update endpoint accepts Client.id (not client_id). We need to obtain it first
    const obtainedClient = await this.get(client);

    const accessToken = await this.getAccessToken();

    const url = `${this.clientsAdminUrl}/${encodeURIComponent(obtainedClient.id!)}`;
    const response = await fetch(url, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(client),
    });

    throwErrorIfNeeded(response);
  }

  async createOrUpdate(client: Partial<Client>): Promise<Client> {
    const obtainedClient = await this.get(client);
    if (obtainedClient) {
      return this.update(client, obtainedClient);
    }
    return this.create(client);
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function throwErrorIfNeeded(response: FetchResponse<any>) {
  log.debug(`Checking response: ${JSON.stringify(response)}`);
  if (!response.ok) {
    const data = response.data;
    const status = response.status;
    const responseText = response.statusText;
    if (data) {
      throw new Error(
        `${JSON.stringify(status)}, ${JSON.stringify(responseText)}, ${JSON.stringify(data)}`,
      );
    }
    throw new Error(`${JSON.stringify(status)}, ${JSON.stringify(responseText)}`);
  }
}

interface ClientWithId extends Client {
  id: string;
}
