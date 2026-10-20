/**
 * Copyright 2025-2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import fs from "fs";
import { fetch, K8s, kind } from "pepr";
import { UDSConfig } from "../../config/config";
import { KeycloakClientMode } from "../../config/types";
import { Client } from "../types";
import { baseUrl, isAuthError, log, throwErrorIfNeeded } from "./common";

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
export const UDS_OPERATOR_CLIENT_ID = "uds-operator";
export const SA_TOKEN_PATH = "/var/run/secrets/keycloak/token";
let cachedToken: string | null = null;
let cachedTokenExp: number = 0;
let tokenRefreshPromise: Promise<string> | null = null;

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
  cachedTokenExp = 0;
}

export function isCachedTokenValid(): boolean {
  if (!cachedToken) return false;
  return cachedTokenExp > Math.floor(Date.now() / 1000) + 5;
}

export async function readServiceAccountToken(path: string = SA_TOKEN_PATH): Promise<string> {
  try {
    return (await fs.promises.readFile(path, "utf-8")).trim();
  } catch (e) {
    throw new Error(
      `Failed to read service account token at ${path}. Is the projected volume mounted?`,
      { cause: e },
    );
  }
}

export async function getClientSecretToken(): Promise<string> {
  let secret;
  try {
    secret = await K8s(kind.Secret).InNamespace(SECRET_NAMESPACE).Get(SECRET_NAME);
  } catch (e) {
    throw new Error(`Failed to retrieve secret ${SECRET_NAMESPACE}/${SECRET_NAME}`, { cause: e });
  }
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
  return response.data.access_token;
}

export async function getSignedJwtToken(): Promise<string> {
  const saToken = await readServiceAccountToken();
  const params = new URLSearchParams();
  params.append("grant_type", "client_credentials");
  params.append("client_assertion_type", "urn:ietf:params:oauth:client-assertion-type:jwt-bearer");
  params.append("client_assertion", saToken);

  const response = await fetch<KeycloakAccessTokenResponse>(clientCredentialsUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  await throwErrorIfNeeded(response);
  return response.data.access_token;
}

function cacheToken(token: string) {
  cachedToken = token;
  try {
    cachedTokenExp = parseKeycloakToken(token).exp;
  } catch (e) {
    log.warn(e, "Failed to parse token expiry, token will not be cached");
    cachedTokenExp = 0;
  }
}

async function refreshToken(): Promise<string> {
  const mode = UDSConfig.keycloakClientMode;

  switch (mode) {
    case KeycloakClientMode.SIGNED_JWT: {
      const token = await getSignedJwtToken();
      cacheToken(token);
      return token;
    }

    case KeycloakClientMode.CLIENT_SECRET: {
      const token = await getClientSecretToken();
      cacheToken(token);
      return token;
    }

    case KeycloakClientMode.AUTO:
    default:
      try {
        const token = await getSignedJwtToken();
        cacheToken(token);
        return token;
      } catch (e) {
        if (!isAuthError(e)) {
          throw e;
        }
        log.warn(e, "Signed JWT authentication failed, falling back to client secret");
        const token = await getClientSecretToken();
        cacheToken(token);
        return token;
      }
  }
}

export async function credentialsGetAccessToken(): Promise<string> {
  if (isCachedTokenValid()) return cachedToken!;

  if (tokenRefreshPromise) return tokenRefreshPromise;

  tokenRefreshPromise = refreshToken().finally(() => {
    tokenRefreshPromise = null;
  });

  return tokenRefreshPromise;
}

export async function credentialsCreateOrUpdate(client: Partial<Client>) {
  log.info(`credentialsCreateOrUpdate: creating/updating client ${client.clientId}`);
  const existingClient = await credentialsGet(client);
  if (existingClient) {
    return credentialsUpdate(client);
  } else {
    return credentialsCreate(client);
  }
}

export async function credentialsCreate(client: Partial<Client>) {
  log.info(`credentialsCreate: creating client ${client.clientId}`);
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
  log.info(`credentialsGet: retrieving client ${client.clientId}`);
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
  log.info(`credentialsUpdate: updating client ${client.clientId}`);
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
  log.info(`credentialsDelete: deleting client ${client.clientId}`);
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
