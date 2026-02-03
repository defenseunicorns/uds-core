/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { fetch, K8s, kind } from "pepr";
import { Client } from "../types.js";
import { baseUrl, log, throwErrorIfNeeded } from "./common.js";

export interface ClientWithId extends Client {
  id: string;
}

export interface KeycloakAccessTokenResponse {
  access_token: string;
}

export function parseKeycloakToken(token: string) {
  return JSON.parse(Buffer.from(token.split(".")[1], "base64").toString()) as KeycloakToken;
}

const clientsAdminUrl = `${baseUrl}/admin/realms/uds/clients`;
const clientCredentialsUrl = `${baseUrl}/realms/uds/protocol/openid-connect/token`;
const SECRET_NAMESPACE = "keycloak";
const SECRET_NAME = "keycloak-client-secrets";
const UDS_OPERATOR_CLIENT_ID = "uds-operator";
let cachedToken: string | null = null;

export interface KeycloakToken {
  exp: number;
  resource_access: {
    "realm-management": {
      roles: string[];
    };
    [key: string]: unknown;
  };

  [key: string]: unknown;
}

export function resetCachedToken() {
  cachedToken = null;
}

export async function credentialsGetAccessToken() {
  if (cachedToken) {
    try {
      const jwt = parseKeycloakToken(cachedToken);
      if (jwt.exp && jwt.exp > Math.floor(Date.now() / 1000) + 5) return cachedToken;
    } catch (e) {
      log.error(e, "Failed to parse cached token");
      cachedToken = null;
    }
  }

  const secret = await K8s(kind.Secret).InNamespace(SECRET_NAMESPACE).Get(SECRET_NAME);
  if (!secret) throw new Error("Missing secret");
  const encodedSecret = secret.data?.[UDS_OPERATOR_CLIENT_ID];
  if (!encodedSecret) throw new Error("Missing client secret");

  const clientSecret = Buffer.from(encodedSecret, "base64").toString("utf-8");
  const params = new URLSearchParams();
  params.append("grant_type", "client_credentials");
  params.append("client_id", UDS_OPERATOR_CLIENT_ID);
  params.append("client_secret", clientSecret);

  const response = await fetch<KeycloakAccessTokenResponse>(clientCredentialsUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  await throwErrorIfNeeded(response);
  cachedToken = response.data.access_token;
  return cachedToken;
}

export async function credentialsCreateOrUpdate(client: Partial<Client>) {
  log.info(`credentialsCreateOrUpdate: creating/updating client ${JSON.stringify(client)}`);
  const existingClient = await credentialsGet(client);
  if (existingClient) {
    return credentialsUpdate(client);
  } else {
    return credentialsCreate(client);
  }
}

export async function credentialsCreate(client: Partial<Client>) {
  log.info(`credentialsCreate: creating client ${JSON.stringify(client)}`);
  const token = await credentialsGetAccessToken();
  const response = await fetch(clientsAdminUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(client),
  });
  await throwErrorIfNeeded(response, () => {
    resetCachedToken();
  });
  return credentialsGet(client);
}

export async function credentialsGet(client: Partial<Client>) {
  log.info(`credentialsGet: retrieving client ${JSON.stringify(client)}`);
  const token = await credentialsGetAccessToken();
  const url = `${clientsAdminUrl}?clientId=${encodeURIComponent(client.clientId!)}`;
  // There's no Client GET REST endpoint that obtains a client based on client_id (the logical client name, like uds-operator).
  // All Admin REST endpoints for client operator on the database Client ID, which is a UUID. The only interface that allows to
  // obtain the Client using the client_id is the collection interface which returns a singular collection with
  // the Client in it.
  const response = await fetch<ClientWithId[]>(url, {
    method: "GET",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
  });
  await throwErrorIfNeeded(response, () => {
    resetCachedToken();
  });
  return response.data[0];
}

export async function credentialsUpdate(client: Partial<Client>) {
  log.info(`credentialsUpdate: updating client ${JSON.stringify(client)}`);
  const token = await credentialsGetAccessToken();
  const existing = await credentialsGet(client);
  if (!existing || !existing.id) {
    throw new Error(`Failed to retrieve existing client, ${client.clientId}`);
  }
  const url = `${clientsAdminUrl}/${encodeURIComponent(existing.id)}`;
  const response = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(client),
  });
  await throwErrorIfNeeded(response, () => {
    resetCachedToken();
  });
  return credentialsGet(client);
}

export async function credentialsDelete(client: Partial<Client>) {
  log.info(`credentialsDelete: deleting client ${JSON.stringify(client)}`);
  const token = await credentialsGetAccessToken();
  const existing = await credentialsGet(client);
  if (!existing || !existing.id) {
    throw new Error(`Failed to retrieve existing client, ${client.clientId}`);
  }
  const url = `${clientsAdminUrl}/${encodeURIComponent(existing.id)}`;
  const response = await fetch(url, {
    method: "DELETE",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
  });
  await throwErrorIfNeeded(response, () => {
    resetCachedToken();
  });
}
