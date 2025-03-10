import { Client } from "./types";
import { fetch } from "pepr";
import { Store } from "../../common";
import { retryWithDelay } from "../utils";
import { Component, setupLogger } from "../../../logger";
import { FetchResponse } from "kubernetes-fluent-client/src/fetch";

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
}

/**
 * Implementation of KeycloakClient using Dynamic Client Registration
 */
export class DynamicClientRegistrationClient implements KeycloakClient {
  private readonly baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  async create(client: Partial<Client>): Promise<Client> {
    const response = await fetch<Client>(this.baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(client),
    });

    this.throwErrorIfNeeded(response);
    await this.updateRegistrationTokenInStore(client);

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

    this.throwErrorIfNeeded(response);
    await this.updateRegistrationTokenInStore(client);

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

    this.throwErrorIfNeeded(response);
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
          return Store.removeItemAndWait(registrationTokenStoreKey);
        }
        return Store.setItemAndWait(registrationTokenStoreKey, client.registrationAccessToken!);
      }, log);
    } catch {
      throw Error(`Failed to remove token from store for client '${client.clientId}'`);
    }
  }

  private throwErrorIfNeeded(response: FetchResponse<Client>) {
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
}
