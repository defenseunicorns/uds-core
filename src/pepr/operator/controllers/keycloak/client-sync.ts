import { K8s, Log, fetch, kind } from "pepr";

import { Store } from "../..";
import { Sso, UDSPackage } from "../../crd";
import { Client } from "./types";
import { UDSConfig } from "../../../config";

const apiURL =
  "http://keycloak-http.keycloak.svc.cluster.local:8080/realms/uds/clients-registrations/default";
// const apiURL = "https://keycloak.admin.uds.dev/realms/uds/clients-registrations/default";

export async function keycloak(pkg: UDSPackage) {
  // Get the list of clients from the package
  const clientReqs = pkg.spec?.sso || [];
  const refs: string[] = [];

  // Pull the isAuthSvcClient prop as it's not part of the KC client spec
  for (const { isAuthSvcClient, ...clientReq } of clientReqs) {
    Log.debug(pkg.metadata, `Processing client request: ${clientReq.clientId}`);

    // Not including the CR data in the ref because Keycloak client IDs must be unique already
    const name = `sso-client-${clientReq.clientId}`;
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
    if (token) {
      Log.debug(pkg.metadata, `Found existing token for ${clientReq.clientId}`);
      client = await apiCall(clientReq, "PUT", token);
    } else {
      Log.debug(pkg.metadata, `Creating new client for ${clientReq.clientId}`);
      client = await apiCall(clientReq);
    }

    // Write the new token to the store
    await Store.setItemAndWait(name, client.registrationAccessToken);

    await K8s(kind.Secret).Apply({
      metadata: {
        namespace: pkg.metadata!.namespace,
        name,
      },
      stringData: clientToStringmap(client),
    });

    // Add the reference to the return list
    refs.push(name);

    if (isAuthSvcClient) {
      // Do things here
    }
  }

  return refs;
}

async function apiCall(sso: Sso, method = "POST", authToken = "") {
  const req = {
    body: JSON.stringify(sso),
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

  const resp = await fetch<Client>(url, req);

  if (!resp.ok) {
    throw new Error(`Failed to ${method} client: ${resp.statusText}`);
  }

  return resp.data;
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
