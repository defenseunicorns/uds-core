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

/**
 * This Client Attribute is checked by the UDSClientPolicyPermissionsExecutor from the UDS Identity Config and ensures
 * the UDS Operator can access the Client
 */
const client_policy_required_attribute_name = "created-by";

/**
 * This Client Attribute is checked by the UDSClientPolicyPermissionsExecutor from the UDS Identity Config and ensures
 * the UDS Operator can access the Client
 */
const client_policy_required_attribute_value = "uds-operator";

export async function dynamicCreateOrUpdate(client: Partial<Client>, isRetry: boolean = false) {
  log.info(`dynamicCreateOrUpdate: creating/updating client ${JSON.stringify(client)}`);
  const token = Store.getItem(`sso-client-${client.clientId}`);
  // The additional check for `isRetry` is address a situation, where a Client has been deleted in Keycloak
  // but Peprs Store update failed. In this case, in a retry loop, we try to create a Client again and the worst
  // case we'll get an HTTP 409 Conflict error.
  if (token && !isRetry) {
    return dynamicUpdate(client);
  }
  return dynamicCreate(client);
}

export async function dynamicCreate(client: Partial<Client>) {
  log.info(`dynamicCreate: creating client ${JSON.stringify(client)}`);
  client = addRequiredAttributesToClient(client);
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
  client = addRequiredAttributesToClient(client);
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

export function addRequiredAttributesToClient(client: Partial<Client>) {
  if (client.attributes) {
    client.attributes[client_policy_required_attribute_name] =
      client_policy_required_attribute_value;
  } else {
    client.attributes = {
      [client_policy_required_attribute_name]: client_policy_required_attribute_value,
    };
  }
  return client;
}
