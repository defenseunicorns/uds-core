import { fetch, K8s, kind } from "pepr";

import { UDSConfig } from "../../../config";
import { Component, setupLogger } from "../../../logger";
import { Store } from "../../common";
import { Sso, UDSPackage } from "../../crd";
import { getOwnerRef } from "../utils";
import { Client } from "./types";

let apiURL =
  "http://keycloak-http.keycloak.svc.cluster.local:8080/realms/uds/clients-registrations/default";
const samlDescriptorUrl =
  "http://keycloak-http.keycloak.svc.cluster.local:8080/realms/uds/protocol/saml/descriptor";

// Support dev mode with port-forwarded keycloak svc
if (process.env.PEPR_MODE === "dev") {
  apiURL = "http://localhost:8080/realms/uds/clients-registrations/default";
}

// Template regex to match clientField() references, see https://regex101.com/r/e41Dsk/3 for details
const secretTemplateRegex = new RegExp(
  'clientField\\(([a-zA-Z]+)\\)(?:\\["?([\\w]+)"?\\]|(\\.json\\(\\)))?',
  "gm",
);

// Template regex to match IDPSSODescriptor in the SAML IDP Descriptor XML, see https://regex101.com/r/DGvzjd/1
const idpSSODescriptorRegex = new RegExp(
  /<[^>]*:IDPSSODescriptor[^>]*>((.|[\n\r])*)<\/[^>]*:IDPSSODescriptor>/,
);

// Template regex to match the X509Certificate within the IDPSSODescriptor XML, see https://regex101.com/r/NjGZF5/1
const x509CertRegex = new RegExp(
  /<[^>]*:X509Certificate[^>]*>((.|[\n\r])*)<\/[^>]*:X509Certificate>/,
);

// configure subproject logger
const log = setupLogger(Component.OPERATOR_KEYCLOAK);

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
  const clients: Map<string, Client> = new Map();

  for (const clientReq of clientReqs) {
    const client = await syncClient(clientReq, pkg);
    clients.set(client.clientId, client);
  }

  await purgeSSOClients(pkg, [...clients.keys()]);

  return clients;
}

/**
 * Remove any remaining clients that are not in the refs list
 *
 * @param pkg the package to process
 * @param refs the list of client refs to keep
 */
export async function purgeSSOClients(pkg: UDSPackage, newClients: string[] = []) {
  // Check for any clients that are no longer in the package and remove them
  const currentClients = pkg.status?.ssoClients || [];
  const toRemove = currentClients.filter(client => !newClients.includes(client));
  for (const ref of toRemove) {
    const storeKey = `sso-client-${ref}`;
    const token = Store.getItem(storeKey);
    if (token) {
      await apiCall({ clientId: ref }, "DELETE", token);
      Store.removeItem(storeKey);
    } else {
      log.warn(pkg.metadata, `Failed to remove client ${ref}, token not found`);
    }
  }
}

async function syncClient(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  { enableAuthserviceSelector, secretName, secretTemplate, ...clientReq }: Sso,
  pkg: UDSPackage,
  isRetry = false,
) {
  log.debug(pkg.metadata, `Processing client request: ${clientReq.clientId}`);

  // Not including the CR data in the ref because Keycloak client IDs must be unique already
  const name = `sso-client-${clientReq.clientId}`;
  let client: Client;
  handleClientGroups(clientReq);

  // Get keycloak client token from the store if this is an existing client
  const token = Store.getItem(name);

  try {
    // If an existing client is found, use the token to update the client
    if (token && !isRetry) {
      log.debug(pkg.metadata, `Found existing token for ${clientReq.clientId}`);
      client = await apiCall(clientReq, "PUT", token);
    } else {
      log.debug(pkg.metadata, `Creating new client for ${clientReq.clientId}`);
      client = await apiCall(clientReq);
    }
  } catch (err) {
    const msg =
      `Failed to process Keycloak request for client '${clientReq.clientId}', package ` +
      `${pkg.metadata?.namespace}/${pkg.metadata?.name}. Error: ${err.message}`;

    // Throw the error if this is the retry or was an initial client creation attempt
    if (isRetry || !token) {
      log.error(`${msg}, retry failed.`);
      // Throw the original error captured from the first attempt
      throw new Error(msg);
    } else {
      // Retry the request without the token in case we have a bad token stored
      log.error(msg);

      try {
        return await syncClient(clientReq, pkg, true);
      } catch (retryErr) {
        // If the retry fails, log the retry error and throw the original error
        const retryMsg =
          `Retry of Keycloak request failed for client '${clientReq.clientId}', package ` +
          `${pkg.metadata?.namespace}/${pkg.metadata?.name}. Error: ${retryErr.message}`;
        log.error(retryMsg);
        // Throw the error from the original attempt since our retry without token failed
        throw new Error(msg);
      }
    }
  }

  // Write the new token to the store
  try {
    await Store.setItemAndWait(name, client.registrationAccessToken!);
  } catch (err) {
    throw Error(
      `Failed to set token in store for client '${clientReq.clientId}', package ` +
        `${pkg.metadata?.namespace}/${pkg.metadata?.name}`,
    );
  }

  // Remove the registrationAccessToken from the client object to avoid problems (one-time use token)
  delete client.registrationAccessToken;

  if (clientReq.protocol === "saml") {
    client.samlIdpCertificate = await getSamlCertificate();
  }

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

  return client;
}

/**
 * Handles the client groups by converting the groups to attributes.
 * @param clientReq - The client request object.
 */
export function handleClientGroups(clientReq: Sso) {
  if (clientReq.groups?.anyOf) {
    clientReq.attributes = clientReq.attributes || {};
    clientReq.attributes["uds.core.groups"] = JSON.stringify(clientReq.groups);
  } else {
    clientReq.attributes = clientReq.attributes || {};
    clientReq.attributes["uds.core.groups"] = ""; // Remove groups attribute from client
  }
  delete clientReq.groups;
}

async function apiCall(sso: Partial<Sso>, method = "POST", authToken = "") {
  // Handle single test mode
  if (UDSConfig.isSingleTest) {
    log.warn(`Generating fake client for '${sso.clientId}' in single test mode`);
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
    // Ensure that we URI encode the clientId in the request URL
    url += `/${encodeURIComponent(sso.clientId!)}`;
  }

  // Remove the body for DELETE requests
  if (method === "DELETE" || method === "GET") {
    delete req.body;
  }

  // Make the request
  const resp = await fetch<Client>(url, req);

  if (!resp.ok) {
    if (resp.data) {
      throw new Error(`${JSON.stringify(resp.statusText)}, ${JSON.stringify(resp.data)}`);
    } else {
      throw new Error(`${JSON.stringify(resp.statusText)}`);
    }
  }

  return resp.data;
}

export function generateSecretData(client: Client, secretTemplate?: { [key: string]: string }) {
  if (secretTemplate) {
    log.debug(`Using secret template for client: ${client.clientId}`);
    // Iterate over the secret template entry and process each value
    return templateData(secretTemplate, client);
  }

  const stringMap: Record<string, string> = {};

  log.debug(`Using client data for secret: ${client.clientId}`);

  // iterate over the client object and convert all values to strings
  for (const [key, value] of Object.entries(client)) {
    // For objects and arrays, convert to a JSON string
    const processed = typeof value === "object" ? JSON.stringify(value) : String(value);

    // Convert the value to a base64 encoded string
    stringMap[key] = Buffer.from(processed).toString("base64");
  }

  return stringMap;
}

export async function getSamlCertificate() {
  const resp = await fetch<string>(samlDescriptorUrl);

  if (!resp.ok) {
    return undefined;
  }

  return extractSamlCertificateFromXML(resp.data);
}

export function extractSamlCertificateFromXML(xmlString: string) {
  const extractedIDPSSODescriptor = xmlString.match(idpSSODescriptorRegex)?.[1] || "";
  return extractedIDPSSODescriptor.match(x509CertRegex)?.[1] || "";
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
