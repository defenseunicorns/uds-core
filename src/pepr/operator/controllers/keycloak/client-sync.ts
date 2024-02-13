import { fetch } from "pepr";
import { Store } from "../..";
import { Sso, UDSPackage } from "../../crd";
import { Client } from "./types";

export async function keycloak(pkg: UDSPackage) {
  // Get the list of clients from the package
  const clientReqs = pkg.spec?.sso || [];

  const refs: string[] = [];

  // Pull the isAuthSvcClient prop as it's not part of the KC client spec
  for (const { isAuthSvcClient, ...clientReq } of clientReqs) {
    // Check if the client exists
    if (!pkg.status?.ssoClients?.includes(clientReq.clientId)) {
      // Create the client via the Keycloak API
      const client = await createClient(clientReq);

      const ref = `sso-client-${pkg.metadata!.name}-${clientReq.clientId}`;

      await Store.setItemAndWait(ref, JSON.stringify(client));

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
  });

  if (!resp.ok) {
    throw new Error(`Failed to create client: ${resp.statusText}`);
  }

  return resp.data;
}
