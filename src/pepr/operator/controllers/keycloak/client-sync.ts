/**
 * Copyright 2024-2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { fetch, K8s, kind } from "pepr";

import { Component, setupLogger } from "../../../logger";
import { Sso, UDSPackage } from "../../crd";
import { getOwnerRef, purgeOrphans, sanitizeResourceName } from "../utils";
import { credentialsCreateOrUpdate, credentialsDelete } from "./clients/client-credentials";
import { throwErrorIfNeeded } from "./clients/common";
import { Client, clientKeys } from "./types";

const samlDescriptorUrl =
  "http://keycloak-http.keycloak.svc.cluster.local:8080/realms/uds/protocol/saml/descriptor";

// Template regex to match clientField() references, see https://regex101.com/r/e41Dsk/3 for details
const secretTemplateRegex = new RegExp(
  'clientField\\(([a-zA-Z]+)\\)(?:\\["?([\\w]+)"?\\]|(\\.json\\(\\)))?',
  "gm",
);

// Matches a signing KeyDescriptor block, non-greedy so that a descriptor
// advertising multiple signing keys (the normal state during signing key
// rotation) does not collapse into one greedy match spanning every certificate,
// which was the original bug. Keycloak sorts signing KeyDescriptors active-key
// first, so the first match holds the realm's active signing key.
const signingKeyDescriptorRegex =
  /<[^>]*:KeyDescriptor[^>]*use="signing"[^>]*>([\s\S]*?)<\/[^>]*:KeyDescriptor>/;

// Matches the X509Certificate within a KeyDescriptor block. See https://regex101.com/r/NjGZF5/4
const x509CertRegex = /<[^>]*:X509Certificate[^>]*>([\s\S]*?)<\/[^>]*:X509Certificate>/;

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
  const generation = (pkg.metadata?.generation ?? 0).toString();

  for (const clientReq of clientReqs) {
    const client = await syncClient(clientReq, pkg);
    clients.set(client.clientId, client);
  }

  // Purge orphaned SSO secrets
  try {
    await purgeOrphans(generation, pkg.metadata!.namespace!, pkg.metadata!.name!, kind.Secret, log);
  } catch (e) {
    log.error(e, `Failed to purge orphaned SSO secrets in for ${pkg.metadata!.name!}: ${e}`);
  }

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
    try {
      await credentialsDelete({ clientId: ref });
    } catch (err) {
      log.warn(
        pkg.metadata,
        `Failed to remove client ${ref}, package ${pkg.metadata?.namespace}/${pkg.metadata?.name}. Error: ${err.message}`,
      );
      throw new Error(
        `Failed to remove client ${ref}, package ${pkg.metadata?.namespace}/${pkg.metadata?.name}. Error: ${err.message}`,
      );
    }
  }
}

/**
 * Need to convert the SSO object into a Client Object to avoid
 * passing groups to keycloak and attributes to the package.sso
 * @param sso
 * @returns
 */
export function convertSsoToClient(sso: Partial<Sso>): Client {
  const client: Partial<Client> = {};

  // Iterate over the properties of Client and check if they exist in sso
  for (const key of clientKeys) {
    if (key in sso) {
      (client as Record<string, unknown>)[key] = sso[key as keyof Sso];
    }
  }

  // Group auth based on sso group membership
  client.attributes = client.attributes || {};

  if (sso.groups?.anyOf) {
    client.attributes["uds.core.groups"] = JSON.stringify(sso.groups);
  } else {
    client.attributes["uds.core.groups"] = "";
  }

  if (client.attributes["logout.confirmation.enabled"]) {
    log.debug(
      `User supplied logout.confirmation.enabled=${client.attributes["logout.confirmation.enabled"]} for client ${client.clientId}, skipping override`,
    );
  } else {
    client.attributes["logout.confirmation.enabled"] = "true";
  }

  // Assert that the result conforms to Client type
  return client as Client;
}

/**
 * Run a Keycloak operation, retrying once on failure to tolerate intermittent
 * errors. If the retry also fails, an error carrying the provided context is
 * thrown so the failure surfaces on the Package CR.
 *
 * @param operation the operation to run
 * @param failureContext description of the operation used in error/log messages
 */
async function retryOnce<T>(operation: () => Promise<T>, failureContext: string): Promise<T> {
  try {
    return await operation();
  } catch (err) {
    const msg = `${failureContext}. Error: ${err.message}`;
    log.error(`${msg}, retrying...`);
    try {
      return await operation();
    } catch (retryErr) {
      // Log the retry error but throw the original context since the retry failed
      log.error(`${failureContext}, retry failed. Error: ${retryErr.message}`);
      throw new Error(msg);
    }
  }
}

export async function syncClient({ secretConfig, ...clientReq }: Sso, pkg: UDSPackage) {
  log.debug(pkg.metadata, `Processing client request: ${clientReq.clientId}`);

  // Not including the CR data in the ref because Keycloak client IDs must be unique already
  const name = `sso-client-${clientReq.clientId}`;
  let client = convertSsoToClient(clientReq);
  const pkgRef = `${pkg.metadata?.namespace}/${pkg.metadata?.name}`;

  client = await retryOnce(
    () => credentialsCreateOrUpdate(client),
    `Failed to process Keycloak request for client '${client.clientId}', package ${pkgRef}`,
  );

  // Remove the registrationAccessToken from the client object to avoid problems (one-time use token)
  delete client.registrationAccessToken;

  if (client.protocol === "saml") {
    client.samlIdpCertificate = await retryOnce(
      () => getSamlCertificate(),
      `Failed to get SAML IdP certificate for client '${client.clientId}', package ${pkgRef}`,
    );
  }

  // Create or update the client secret
  if (!client.publicClient) {
    const generation = (pkg.metadata?.generation ?? 0).toString();
    const sanitizedSecretName = sanitizeResourceName(secretConfig?.name || name);

    // Prepare default labels
    const secretLabels: Record<string, string> = {
      "uds/package": pkg.metadata!.name || "",
      "uds/generation": generation,
    };

    // Apply any additional user-defined labels from the CRD
    if (secretConfig?.labels) {
      Object.assign(secretLabels, secretConfig.labels);
    }

    // Prepare annotations if defined in the CRD
    const secretAnnotations: Record<string, string> = {};

    // Apply any user-defined annotations from the CRD
    if (secretConfig?.annotations) {
      Object.assign(secretAnnotations, secretConfig.annotations);
    }

    await K8s(kind.Secret).Apply({
      metadata: {
        namespace: pkg.metadata!.namespace,
        // Use the CR secret name if provided, otherwise use the client name
        name: sanitizedSecretName,
        labels: secretLabels,
        annotations: secretAnnotations,

        // Use the CR as the owner ref for each VirtualService
        ownerReferences: getOwnerRef(pkg),
      },
      data: generateSecretData(client, secretConfig?.template),
    });
  }

  return client;
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
  await throwErrorIfNeeded(resp);
  return extractSamlCertificateFromXML(resp.data);
}

/**
 * Extract the realm's active signing certificate from the SAML IdP descriptor XML.
 *
 * A realm can advertise multiple signing KeyDescriptors (normal during signing-key
 * rotation). Keycloak sorts them active-key first, so the first signing
 * KeyDescriptor holds the realm's active signing key. Matching that block
 * non-greedily keeps the certificates from running together (the original bug).
 *
 * Throws when no signing certificate is found so the error surfaces on the Package
 * CR instead of silently provisioning a broken secret.
 */
export function extractSamlCertificateFromXML(xmlString: string): string {
  const signingKeyDescriptor = xmlString.match(signingKeyDescriptorRegex)?.[1];
  // Keycloak may line-wrap the base64; strip all whitespace.
  const cert = signingKeyDescriptor?.match(x509CertRegex)?.[1]?.replace(/\s+/g, "");

  if (!cert) {
    throw new Error("SAML IdP descriptor contains no signing X509Certificate");
  }

  return cert;
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
