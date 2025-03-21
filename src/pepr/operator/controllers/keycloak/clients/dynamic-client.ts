import { Client } from "../types";
import {
  credentialsCreateOrUpdate,
  credentialsDelete,
  credentialsGetAccessToken,
} from "./client-credentials";
import { dynamicCreateOrUpdate, dynamicDelete } from "./dynamic-client-registration";
import { log } from "./common";

export async function createOrUpdateClient(client: Partial<Client>) {
  const strategy = process.env.PEPR_KEYCLOAK_CLIENT_STRATEGY || "auto";
  if (strategy === "client_credentials") {
    return credentialsCreateOrUpdate(client);
  } else if (strategy === "auto") {
    try {
      await credentialsGetAccessToken();
      return credentialsCreateOrUpdate(client);
    } catch {
      log.info("Falling back to dynamic registration");
      return dynamicCreateOrUpdate(client);
    }
  } else {
    return dynamicCreateOrUpdate(client);
  }
}

export async function deleteClient(client: Partial<Client>) {
  const strategy = process.env.PEPR_KEYCLOAK_CLIENT_STRATEGY || "auto";
  if (strategy === "client_credentials") {
    return credentialsDelete(client);
  } else if (strategy === "auto") {
    try {
      await credentialsGetAccessToken();
      return credentialsDelete(client);
    } catch {
      log.info("Falling back to dynamic registration");
      return dynamicDelete(client);
    }
  } else {
    return dynamicDelete(client);
  }
}
