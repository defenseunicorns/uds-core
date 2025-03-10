/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { Client } from "./types";
import {fetch, K8s, kind} from "pepr";
import { Store } from "../../common";
import { retryWithDelay } from "../utils";
import { Component, setupLogger } from "../../../logger";
import { FetchResponse } from "kubernetes-fluent-client/src/fetch";
import { logger } from "bs-logger";

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
 * Implementation of KeycloakClient using Dynamic Client Registration
 */
export class DynamicClientRegistrationClient implements KeycloakClient {
  private readonly baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
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
    const response = await fetch<Client>(this.baseUrl, {
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
    const registrationTokenStoreKey = `sso-client-${client.clientId}`;
    const registrationToken = Store.getItem(registrationTokenStoreKey) as string;

    const url = `${this.baseUrl}/${encodeURIComponent(client.clientId!)}`;
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
    const registrationTokenStoreKey = `sso-client-${client.clientId}`;
    const registrationToken = Store.getItem(registrationTokenStoreKey) as string;

    const url = `${this.baseUrl}/${encodeURIComponent(client.clientId!)}`;
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
 * Implementation of KeycloakClient using a Mock for testing purposes
 */
export class ClientCredentialsKeycloakClient implements KeycloakClient {


  private static readonly KEYCLOAK_CLINETS_SECRET_NAMESPACE = "keycloak";
  private static readonly KEYCLOAK_CLINETS_SECRET = "keycloak-client-secrets";
  private static readonly UDS_OPERATOR_CLIENT_ID = "uds-operator";

  private readonly clientCredentialsUrl: string;
  private readonly clientsAdminUrl: string;

  constructor(baseUrl: string) {
    this.clientsAdminUrl = baseUrl + "/admin/realms/uds/clients";
    this.clientCredentialsUrl = baseUrl + "/realms/uds/protocol/openid-connect/token";
  }

  async getAccessToken() {
    log.error(`###1`)
    //TODO: Check out why it contains additional new line at the end?
    const keycloakClientsSecret = await K8s(kind.Secret).InNamespace(ClientCredentialsKeycloakClient.KEYCLOAK_CLINETS_SECRET_NAMESPACE).Get(ClientCredentialsKeycloakClient.KEYCLOAK_CLINETS_SECRET)
    log.error(`###2`)
    if (!keycloakClientsSecret) {
      throw new Error(`The ${ClientCredentialsKeycloakClient.KEYCLOAK_CLINETS_SECRET} secret does not exist in the ${ClientCredentialsKeycloakClient.KEYCLOAK_CLINETS_SECRET_NAMESPACE} namespace.`);
    }
    log.error(`###3`)
    const udsOperatorClientSecret = keycloakClientsSecret.data?.[ClientCredentialsKeycloakClient.UDS_OPERATOR_CLIENT_ID] ?? "";
    log.error(`###4`)
    if (!udsOperatorClientSecret) {
      throw new Error(`The ${ClientCredentialsKeycloakClient.KEYCLOAK_CLINETS_SECRET} doesn't contain the ${ClientCredentialsKeycloakClient.UDS_OPERATOR_CLIENT_ID} key.`);
    }
    log.error(`###5`)

    const clientSecret = Buffer.from(udsOperatorClientSecret, "base64").toString("utf-8");
    log.error(`###6 ${clientSecret}`)
    log.error(`###7 f8ySRQLWUx6coZCz269nkES4z7NRlBPy`)

    const params = new URLSearchParams();
    params.append("grant_type", "client_credentials");
    params.append("client_id", ClientCredentialsKeycloakClient.UDS_OPERATOR_CLIENT_ID);
    params.append("client_secret", "f8ySRQLWUx6coZCz269nkES4z7NRlBPy");

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
    log.error(`###8 ${JSON.stringify(response)}`)
    throwErrorIfNeeded(response)
    return response.data.access_token
  };


  async create(client: Partial<Client>): Promise<Client> {
    const accessToken = await this.getAccessToken();
    const url = `${this.clientsAdminUrl}`;
    const response = await fetch<Client>(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(client),
    });

    throwErrorIfNeeded(response);
    return response.data;
  }

  async clientExists(client: Partial<Client>): Promise<boolean> {
    const accessToken = await this.getAccessToken();
    const url = `${this.clientsAdminUrl}?clientId=${encodeURIComponent(client.clientId!)}`;
    const response = await fetch<Client[]>(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    });
    log.error(`###9 ${JSON.stringify(response)}`)
    log.error(`###10 ${JSON.stringify(response.data)}`)
    log.error(`###11 ${response.status}`)

    throwErrorIfNeeded(response);
    log.error(`###13 ${response.data.length}`)
    return response.data.length > 0;
  }

  async update(client: Partial<Client>): Promise<Client> {
    const accessToken = await this.getAccessToken();
    const url = `${this.clientsAdminUrl}/${encodeURIComponent(client.clientId!)}`;
    const response = await fetch<Client>(url, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(client),
    });

    throwErrorIfNeeded(response);
    return response.data;
  }

  async delete(client: Partial<Client>): Promise<void> {
    const accessToken = await this.getAccessToken();
    const url = `${this.clientsAdminUrl}/${encodeURIComponent(client.clientId!)}`;
    const response = await fetch<Client>(url, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    });

    throwErrorIfNeeded(response);
  }

  async createOrUpdate(client: Partial<Client>): Promise<Client> {
    if (await this.clientExists(client)) {
      return this.update(client);
    }
    return this.create(client);
  }
}

function throwErrorIfNeeded(response: FetchResponse<any>) {
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