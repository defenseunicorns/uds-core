import { Log, fetch } from "pepr";

import { Store } from "../..";
import { Sso, UDSPackage } from "../../crd";
import { compress } from "../utils";
import { Client } from "./types";

export async function keycloak(pkg: UDSPackage) {
  // Get the list of clients from the package
  const clientReqs = pkg.spec?.sso || [];

  const refs: string[] = [];

  // Pull the isAuthSvcClient prop as it's not part of the KC client spec
  for (const { isAuthSvcClient, ...clientReq } of clientReqs) {
    Log.debug(pkg.metadata, `Processing client request: ${clientReq.clientId}`);

    // Check if the client exists
    if (!pkg.status?.ssoClients?.includes(clientReq.clientId)) {
      // Create the client via the Keycloak API
      const client = await createClient(clientReq);

      // Convert to JSON & compress with the Brotli algorithm
      const ref = `sso-client-${pkg.metadata!.name}-${clientReq.clientId}`;
      const payload = await compress(JSON.stringify(client));

      // Store the client in the package store
      await Store.setItemAndWait(ref, payload.toString("base64"));

      // Add the reference to the return list
      refs.push(ref);

      if (isAuthSvcClient) {
        // Do things here
      }
    }
  }

  return refs;
}

async function createClient(sso: Sso) {
  const url = `http://keycloak-http.keycloak.svc.cluster.local:8080/realms/uds/clients-registrations/default`;
  const resp = await fetch<Client>(url, {
    body: JSON.stringify(sso),
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!resp.ok) {
    const err = `Failed to create client: ${resp.statusText}`;
    Log.error(resp, err);
    throw new Error(err);
  }

  return resp.data;
}
