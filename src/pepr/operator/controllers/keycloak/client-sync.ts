import { K8s, Log, fetch, kind } from "pepr";

import { UDSConfig } from "../../../config";
import { Store } from "../../common";
import { Sso, UDSPackage } from "../../crd";
import { getOwnerRef } from "../utils";
import { Client } from "./types";

const apiURL =
  "http://keycloak-http.keycloak.svc.cluster.local:8080/realms/uds/clients-registrations/default";

// Template regex to match clientField() references, see https://regex101.com/r/e41Dsk/3 for details
const secretTemplateRegex = new RegExp(
  'clientField\\(([a-zA-Z]+)\\)(?:\\["?([\\w]+)"?\\]|(\\.json\\(\\)))?',
  "gm",
);

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
      Store.removeItem(ref);
      await apiCall({ clientId }, "DELETE", token);
    } else {
      Log.warn(pkg.metadata, `Failed to remove client ${clientId}, token not found`);
    }
  }
}

async function syncClient(
  { isAuthSvcClient, secretName, secretTemplate, ...clientReq }: Sso,
  pkg: UDSPackage,
  isRetry = false,
) {
  Log.debug(pkg.metadata, `Processing client request: ${clientReq.clientId}`);

  try {
    // Not including the CR data in the ref because Keycloak client IDs must be unique already
    const name = `sso-client-${clientReq.clientId}`;
    const token = Store.getItem(name);

    let client: Client;

    // If an existing client is found, update it
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
        name: secretName || name,
        labels: {
          "uds/package": pkg.metadata!.name,
        },
        // Use the CR as the owner ref for each VirtualService
        ownerReferences: getOwnerRef(pkg),
      },
      data: generateSecretData(client, secretTemplate),
    });

    if (isAuthSvcClient) {
      // Do things here
    }

    return name;
  } catch (err) {
    const msg =
      `Failed to process client request '${clientReq.clientId}' for ` +
      `${pkg.metadata?.namespace}/${pkg.metadata?.name}. This can occur if a client already exists with the same ID that Pepr isn't tracking.`;
    Log.error({ err }, msg);

    if (isRetry) {
      Log.error(`${msg}, retry failed, aborting`);
      throw new Error(`${msg}. RETRY FAILED, aborting: ${JSON.stringify(err)}`);
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

export function generateSecretData(client: Client, secretTemplate?: { [key: string]: string }) {
  if (secretTemplate) {
    Log.debug(`Using secret template for client: ${client.clientId}`);
    // Iterate over the secret template entry and process each value
    return templateData(secretTemplate, client);
  }

  const stringMap: Record<string, string> = {};

  Log.debug(`Using client data for secret: ${client.clientId}`);

  // iterate over the client object and convert all values to strings
  for (const [key, value] of Object.entries(client)) {
    // For objects and arrays, convert to a JSON string
    const processed = typeof value === "object" ? JSON.stringify(value) : String(value);

    // Convert the value to a base64 encoded string
    stringMap[key] = Buffer.from(processed).toString("base64");
  }

  return stringMap;
}

/**
 * Process the secret template and convert the client data to base64 encoded strings for use in a secret
 *
 * @param secretTemplate The template to use for generating the secret
 * @param client
 * @returns
 */
function templateData(secretTemplate: { [key: string]: string }, client: Client) {
  const stringMap: Record<string, string> = {};

  // Iterate over the secret template and process each entry
  for (const [key, value] of Object.entries(secretTemplate)) {
    // Replace any clientField() references with the actual client data
    const templated = value.replace(
      secretTemplateRegex,
      (_match, fieldName: keyof Client, key, json) => {
        // Make typescript happy with a more generic type
        const value = client[fieldName] as Record<string | number, string> | string;

        // If a key is provided, use it to get the value
        if (key) {
          return String(value[key] ?? "");
        }

        // If .json() is provided, convert the value to a JSON string
        if (json) {
          return JSON.stringify(value);
        }

        // Otherwise, convert the value to a string
        return value !== undefined ? String(value) : "";
      },
    );

    // Convert the templated value to a base64 encoded string
    stringMap[key] = Buffer.from(templated).toString("base64");
  }

  // Return the processed secret template without any further processing
  return stringMap;
}
