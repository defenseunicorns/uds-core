/**
 * Copyright 2025-2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import fs from "fs";
import { fetch, K8s, kind } from "pepr";
import { UDSConfig } from "../../config/config";
import { KeycloakClientMode } from "../../config/types";
import { Client } from "../types";
import { baseUrl, isAuthError, KeycloakHttpError, log, throwErrorIfNeeded } from "./common";
import {
  assertPackageCanDeleteClient,
  assertCurrentPackageUid,
  assertSoleLivePackageClaimIn,
  assertUnambiguousPackageHistory,
  assertSoleLivePackageClaim,
  isCompletedPackageClientHandoff,
  listLivePackages,
  PACKAGE_OWNER_UID_ATTRIBUTE,
  PackageClientOwner,
} from "../client-owner";

export interface ClientWithId extends Client {
  id: string;
}

interface ClientSummary {
  id?: string;
  clientId?: string;
}

interface ClientRepresentation extends Partial<Client> {
  id?: string;
  clientId?: string;
}

export interface KeycloakAccessTokenResponse {
  access_token: string;
}

export function parseKeycloakToken(token: string) {
  return JSON.parse(Buffer.from(token.split(".")[1], "base64").toString()) as KeycloakToken;
}

const clientsAdminUrl = `${baseUrl}/admin/realms/uds/clients`;
const CLIENT_SEARCH_LIMIT = 100;
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

export async function credentialsCreateOrUpdate(
  client: Partial<Client>,
  owner: PackageClientOwner,
): Promise<ClientWithId> {
  const clientId = requireClientId(client);
  log.info(`credentialsCreateOrUpdate: creating/updating client ${clientId}`);

  let existing = await findExactClient(clientId);
  if (existing) {
    return updateClientByUuid(client, owner, existing, clientId);
  }

  // Verify current ownership immediately before creating a realm-global client.
  await assertSoleLivePackageClaim(clientId, owner);
  const createRequest = addOwnerMarker(client, owner);
  try {
    await postClient(createRequest);
  } catch (error) {
    if (!(error instanceof KeycloakHttpError && error.httpStatus === 409)) {
      throw error;
    }

    // A client may have appeared after the initial lookup. Re-check live
    // Package claims and prove ownership before any update or secret return.
    existing = await findExactClient(clientId);
    if (!existing) {
      throw new Error(
        `Keycloak rejected creation of client "${clientId}" and no exact client match exists`,
      );
    }
    return updateClientByUuid(client, owner, existing, clientId);
  }

  const created = await findExactClient(clientId);
  if (!created) {
    throw new Error(
      `Keycloak accepted creation of client "${clientId}" but the client could not be retrieved`,
    );
  }
  assertOwnerMarker(created, clientId, owner);
  return created as ClientWithId;
}

/** Delete a client after verifying its UID marker or unique legacy ownership evidence. */
export async function credentialsDelete(
  client: Pick<Partial<Client>, "clientId">,
  owner: PackageClientOwner,
): Promise<void> {
  const clientId = requireClientId(client);
  log.info(`credentialsDelete: deleting client ${clientId}`);
  const existing = await findExactClient(clientId);
  if (!existing) {
    return;
  }

  const marker = getOwnerMarker(existing);
  const packages = await listLivePackages();
  assertCurrentPackageUid(packages, owner, clientId);
  if (marker === undefined) {
    assertPackageCanDeleteClient(packages, clientId, owner);
    assertUnambiguousPackageHistory(packages, clientId, owner);
  }

  const token = await credentialsGetAccessToken();
  const verified = await getClientByUuid(existing.id!, clientId);
  if (!verified) {
    return;
  }
  const currentMarker = getOwnerMarker(verified);
  if (currentMarker !== undefined && currentMarker !== owner.uid) {
    const markerWasStable = marker === undefined || marker === currentMarker;
    if (
      markerWasStable &&
      isCompletedPackageClientHandoff(packages, clientId, owner, currentMarker)
    ) {
      // The former owner's delete succeeded, but its status update did not.
      // The new owner's verified UUID and marker must remain untouched.
      return;
    }
    throw ownershipMismatchError(clientId, owner, currentMarker);
  }
  if (marker !== undefined && currentMarker === undefined) {
    throw ownershipMismatchError(clientId, owner, currentMarker);
  }

  const response = await fetch(`${clientsAdminUrl}/${encodeURIComponent(existing.id!)}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
  });
  if (response.status === 404) {
    return;
  }
  await throwErrorIfNeeded(response, () => resetCachedToken());
}

async function updateClientByUuid(
  client: Partial<Client>,
  owner: PackageClientOwner,
  initial: ClientRepresentation,
  clientId: string,
): Promise<ClientWithId> {
  const id = initial.id!;
  const initialMarker = getOwnerMarker(initial);
  if (initialMarker !== undefined && initialMarker !== owner.uid) {
    throw ownershipMismatchError(clientId, owner, initialMarker);
  }

  const packages = await listLivePackages();
  assertSoleLivePackageClaimIn(packages, clientId, owner);
  if (initialMarker === undefined) {
    assertUnambiguousPackageHistory(packages, clientId, owner);
  }
  const token = await credentialsGetAccessToken();
  const existing = await getClientByUuid(id, clientId);
  if (!existing) {
    throw new Error(`Keycloak client "${clientId}" disappeared before update`);
  }
  const marker = getOwnerMarker(existing);
  if (marker !== owner.uid && marker !== undefined) {
    throw ownershipMismatchError(clientId, owner, marker);
  }
  await putClientByUuid(addOwnerMarker(client, owner), id, token);
  const updated = await getClientByUuid(id, clientId);
  if (!updated) {
    throw new Error(`Keycloak client "${clientId}" disappeared after update`);
  }
  assertOwnerMarker(updated, clientId, owner);
  return updated as ClientWithId;
}

function addOwnerMarker(client: Partial<Client>, owner: PackageClientOwner): Partial<Client> {
  return {
    ...client,
    attributes: {
      ...client.attributes,
      [PACKAGE_OWNER_UID_ATTRIBUTE]: owner.uid,
    },
  };
}

async function findExactClient(clientId: string): Promise<ClientRepresentation | undefined> {
  const query = new URLSearchParams({ clientId, first: "0", max: CLIENT_SEARCH_LIMIT.toString() });
  const response = await fetch<ClientSummary[]>(`${clientsAdminUrl}?${query.toString()}`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${await credentialsGetAccessToken()}`,
    },
  });
  await throwErrorIfNeeded(response, () => resetCachedToken());
  if (!Array.isArray(response.data) || response.data.length >= CLIENT_SEARCH_LIMIT) {
    throw new Error(`Keycloak client lookup for "${clientId}" was incomplete`);
  }
  const matches = response.data.filter(client => client.clientId === clientId);
  if (matches.length > 1) {
    throw new Error(`Keycloak returned multiple exact matches for client "${clientId}"`);
  }
  const match = matches[0];
  if (!match) {
    return undefined;
  }
  if (!match.id) {
    throw new Error(
      `Keycloak returned an exact match for client "${clientId}" without an internal ID`,
    );
  }
  const fullClient = await getClientByUuid(match.id, clientId);
  if (!fullClient) {
    throw new Error(`Keycloak client "${clientId}" disappeared during ownership verification`);
  }
  return fullClient;
}

async function getClientByUuid(
  id: string,
  expectedClientId: string,
): Promise<ClientRepresentation | undefined> {
  const token = await credentialsGetAccessToken();
  const response = await fetch<ClientRepresentation>(
    `${clientsAdminUrl}/${encodeURIComponent(id)}`,
    {
      method: "GET",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    },
  );
  if (response.status === 404) {
    return undefined;
  }
  await throwErrorIfNeeded(response, () => resetCachedToken());
  if (response.data?.id !== id || response.data.clientId !== expectedClientId) {
    throw new Error(`Keycloak UUID lookup did not return the exact client "${expectedClientId}"`);
  }
  return response.data;
}

async function postClient(client: Partial<Client>): Promise<void> {
  const token = await credentialsGetAccessToken();
  const response = await fetch(clientsAdminUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(client),
  });
  await throwErrorIfNeeded(response, () => resetCachedToken());
}

async function putClientByUuid(
  client: ClientRepresentation,
  id: string,
  token?: string,
): Promise<void> {
  const requestToken = token ?? (await credentialsGetAccessToken());
  const response = await fetch(`${clientsAdminUrl}/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${requestToken}` },
    body: JSON.stringify(client),
  });
  await throwErrorIfNeeded(response, () => resetCachedToken());
}

function assertOwnerMarker(
  client: ClientRepresentation,
  clientId: string,
  owner: PackageClientOwner,
): void {
  const marker = getOwnerMarker(client);
  if (marker !== owner.uid) {
    throw ownershipMismatchError(clientId, owner, marker);
  }
}

function getOwnerMarker(client: ClientRepresentation): string | undefined {
  return client.attributes?.[PACKAGE_OWNER_UID_ATTRIBUTE];
}

function ownershipMismatchError(
  clientId: string,
  owner: PackageClientOwner,
  actualOwnerUid: string | undefined,
): Error {
  return new Error(
    `Keycloak client "${clientId}" is not owned by Package ${owner.namespace}/${owner.name} (UID ${owner.uid}); current owner marker is ${actualOwnerUid ?? "missing"}`,
  );
}

function requireClientId(client: Pick<Partial<Client>, "clientId">): string {
  if (!client.clientId) {
    throw new Error("A client ID is required for Package-managed Keycloak operations");
  }
  return client.clientId;
}
