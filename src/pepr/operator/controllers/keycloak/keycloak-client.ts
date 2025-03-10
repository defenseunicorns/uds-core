/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { Client } from "./types";
import { fetch } from "pepr";
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

    this.throwErrorIfNeeded(response);
    await this.updateRegistrationTokenInStore(response.data);

    return response.data;
  }

  async update(client: Partial<Client>): Promise<Client> {
    const registrationTokenStoreKey = `sso-client-${client.clientId}`;
    const registrationToken = Store.getItem(registrationTokenStoreKey) as string;

    logger.warn(`########## Updating client ${client.clientId}`);
    logger.warn(`########## Updating client ${client.clientId}`);
    logger.warn(`########## Updating client ${client.clientId}`);
    logger.warn(`########## Updating client $registrationToken}`);
    logger.warn(`########## Updating client ${registrationToken}`);
    logger.warn(`########## Updating client ${registrationToken}`);

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
          await Store.removeItemAndWait(registrationTokenStoreKey);
        } else {
          await Store.setItemAndWait(registrationTokenStoreKey, client.registrationAccessToken!);
        }
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
