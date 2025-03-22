/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { fetch } from "pepr";
import { Store } from "../../../common";
import { retryWithDelay } from "../../utils";
import { Client } from "../types";
import { baseUrl, log, throwErrorIfNeeded } from "./common";

const dynamicUrl = `${baseUrl}/realms/uds/clients-registrations/default`;

export async function dynamicCreateOrUpdate(client: Partial<Client>) {
  log.info(`dynamicCreateOrUpdate: creating/updating client ${JSON.stringify(client)}`);
  const token = Store.getItem(`sso-client-${client.clientId}`);
  if (token) {
    return dynamicUpdate(client);
  }
  return dynamicCreate(client);
}

export async function dynamicCreate(client: Partial<Client>) {
  log.info(`dynamicCreate: creating client ${JSON.stringify(client)}`);
  const response = await fetch<Client>(dynamicUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(client),
  });
  await throwErrorIfNeeded(response);
  await updateDynamicToken(client.clientId!, response.data.registrationAccessToken);
  return response.data;
}

export async function dynamicUpdate(client: Partial<Client>) {
  log.info(`dynamicUpdate: updating client ${JSON.stringify(client)}`);
  const token = Store.getItem(`sso-client-${client.clientId}`);
  const url = `${dynamicUrl}/${encodeURIComponent(client.clientId!)}`;
  const response = await fetch<Client>(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(client),
  });
  await throwErrorIfNeeded(response);
  await updateDynamicToken(client.clientId!, response.data.registrationAccessToken);
  return response.data;
}

export async function dynamicDelete(client: Partial<Client>) {
  log.info(`dynamicDelete: deleting client ${JSON.stringify(client)}`);
  const token = Store.getItem(`sso-client-${client.clientId}`);
  const url = `${dynamicUrl}/${encodeURIComponent(client.clientId!)}`;
  const response = await fetch(url, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  await throwErrorIfNeeded(response);
  await updateDynamicToken(client.clientId!, undefined);
}

async function updateDynamicToken(clientId: string, token: string | undefined) {
  const storeKey = `sso-client-${clientId}`;
  await retryWithDelay(async () => {
    if (token === undefined) {
      await Store.removeItemAndWait(storeKey);
    } else {
      await Store.setItemAndWait(storeKey, token);
    }
  }, log);
}
