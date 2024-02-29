import { K8s, Log, fetch, kind } from "pepr";

import { UDSConfig } from "../../../config";
import { Store } from "../../common";
import { Sso, UDSPackage } from "../../crd";
import { Client } from "./types";

const apiURL =
  "http://keycloak-http.keycloak.svc.cluster.local:8080/realms/uds/clients-registrations/default";

/**
 * Create or update the Keycloak clients for the package
 *
 * @param pkg the package to process
 *
 * @returns the list of client refs
 */
export async function keycloak(pkg: UDSPackage) {
  // Get the list of clients from the package
  const clientReqs = pkg.spec?.sso || [];
  const refs: string[] = [];

  // Pull the isAuthSvcClient prop as it's not part of the KC client spec
  for (const clientReq of clientReqs) {
    const ref = await syncClient(clientReq, pkg);
    refs.push(ref);
  }

  await purgeSSOClients(pkg, refs);

  return refs;
}

/**
 * Remove any remaining clients that are not in the refs list
 *
 * @param pkg the package to process
 * @param refs the list of client refs to keep
 */
export async function purgeSSOClients(pkg: UDSPackage, refs: string[] = []) {
  // Check for any clients that are no longer in the package and remove them
  const currentClients = pkg.status?.ssoClients || [];
  const toRemove = currentClients.filter(client => !refs.includes(client));
  for (const ref of toRemove) {
    const token = Store.getItem(ref);
    const clientId = ref.replace("sso-client-", "");
    if (token) {
      await apiCall({ clientId }, "DELETE", token);
    } else {
      Log.warn(pkg.metadata, `Failed to remove client ${clientId}, token not found`);
    }
  }
}

async function syncClient(
  { isAuthSvcClient, ...clientReq }: Sso,
  pkg: UDSPackage,
  isRetry = false,
) {
  Log.debug(pkg.metadata, `Processing client request: ${clientReq.clientId}`);

  try {
    // Not including the CR data in the ref because Keycloak client IDs must be unique already
    const name = getClientName(clientReq);
    const token = Store.getItem(name);

    let client: Client;

    // If the redirectUris are not set, default to *
    if (!clientReq.redirectUris) {
      clientReq.redirectUris = ["*"];
    } else {
      // Replace UDS_DOMAIN with the actual domain for each redirectUri
      clientReq.redirectUris = clientReq.redirectUris.map(uri =>
        uri.replace("UDS_DOMAIN", UDSConfig.domain),
      );
    }

    // If and existing client is found, update it
    if (token && !isRetry) {
      Log.debug(pkg.metadata, `Found existing token for ${clientReq.clientId}`);
      client = await apiCall(clientReq, "PUT", token);
    } else {
      Log.debug(pkg.metadata, `Creating new client for ${clientReq.clientId}`);
      client = await apiCall(clientReq);
    }

    // Write the new token to the store
    await Store.setItemAndWait(name, client.registrationAccessToken!);

    // Remove the registrationAccessToken from the client object to avoid problems (one-time use token)
    delete client.registrationAccessToken;

    // Create or update the client secret
    await K8s(kind.Secret).Apply({
      metadata: {
        namespace: pkg.metadata!.namespace,
        // Use the CR secret name if provided, otherwise use the client name
        name: clientReq.secretName || name,
      },
      stringData: clientToStringmap(client),
    });

    if (isAuthSvcClient) {
      // Do things here
    }

    return name;
  } catch (err) {
    const msg =
      `Failed to process client request '${clientReq.clientId}' for ` +
      `${pkg.metadata?.namespace}/${pkg.metadata?.name}`;
    Log.error({ err }, msg);

    if (isRetry) {
      Log.error(`${msg}, retry failed, aborting`);
      throw err;
    }

    // Retry the request
    Log.warn(`${msg}, retrying`);
    return syncClient(clientReq, pkg, true);
  }
}

async function apiCall(sso: Partial<Sso>, method = "POST", authToken = "") {
  // Handle single test mode
  if (UDSConfig.isSingleTest) {
    Log.warn(`Generating fake client for '${sso.clientId}' in single test mode`);
    return {
      ...sso,
      secret: sso.secret || "fake-secret",
      registrationAccessToken: "fake-registration-access-token",
    } as Client;
  }

  const req = {
    body: JSON.stringify(sso) as string | undefined,
    method,
    headers: {
      "Content-Type": "application/json",
    } as Record<string, string>,
  };

  let url = apiURL;

  // When not creating a new client, add the client ID and registrationAccessToken
  if (authToken) {
    req.headers.Authorization = `Bearer ${authToken}`;
    url += `/${sso.clientId}`;
  }

  // Remove the body for DELETE requests
  if (method === "DELETE") {
    delete req.body;
  }

  // Make the request
  const resp = await fetch<Client>(url, req);

  if (!resp.ok) {
    throw new Error(`Failed to ${method} client: ${resp.statusText}`);
  }

  return resp.data;
}

function getClientName(client: Partial<Sso>) {
  return `sso-client-${client.clientId}`;
}

function clientToStringmap(client: Client) {
  const stringMap: Record<string, string> = {};

  // iterate over the client object and convert all values to strings
  for (const [key, value] of Object.entries(client)) {
    if (typeof value === "object") {
      // For objects and arrays, convert to a JSON string
      stringMap[key] = JSON.stringify(value);
    } else {
      // For primitive values, convert directly to string
      stringMap[key] = String(value);
    }
  }

  return stringMap;
}
