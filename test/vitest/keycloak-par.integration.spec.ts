/**
 * Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { describe, expect, it } from "vitest";

const gateways = [
  ["tenant", "https://sso.uds.dev"],
  ["admin", "https://keycloak.admin.uds.dev"],
] as const;
const getParEndpoint = (origin: string, realm: string) =>
  `${origin}/realms/${realm}/protocol/openid-connect/ext/par/request`;

async function postPar(endpoint: string): Promise<Response> {
  return fetch(endpoint, {
    method: "POST",
    redirect: "manual",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "client_id=par-access-integration-test",
    signal: AbortSignal.timeout(10_000),
  });
}

describe.skipIf(process.env.SKIP_INTEGRATION === "true")(
  "integration - Keycloak PAR access",
  () => {
    it.each(gateways)("denies PAR variants through the %s gateway", async (_name, origin) => {
      const endpoint = getParEndpoint(origin, "uds");
      const paths = [
        ["bare endpoint", endpoint, 404],
        ["trailing slash", `${endpoint}/`, 404],
        ["query string", `${endpoint}?client_id=par-access-integration-test`, 404],
        ["literal final semicolon", `${endpoint};probe=1`, 400],
        ["encoded final semicolon", `${endpoint}%3Bprobe=1`, 404],
        ["literal non-final semicolon", endpoint.replace("/request", ";probe=1/request"), 400],
        ["encoded non-final semicolon", endpoint.replace("/request", "%3Bprobe=1/request"), 404],
      ] as const;

      for (const [description, path, expectedStatus] of paths) {
        const response = await postPar(path);
        expect(response.status, description).toBe(expectedStatus);
      }
    });

    it("denies PAR for the master realm through the admin gateway", async () => {
      const endpoint = getParEndpoint(gateways[1][1], "master");
      expect((await postPar(endpoint)).status).toBe(404);
    });
  },
);
