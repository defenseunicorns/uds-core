/**
 * Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { K8s, kind } from "pepr";
import { beforeAll, describe, expect, it } from "vitest";
import { UDSPackage } from "../../src/pepr/operator/crd";
import { getAdminToken } from "./helpers/keycloak";

const CLIENT_ID = "uds-core-admin-grafana";
const PACKAGE_NAMESPACE = "grafana";
const PUBLIC_KEYCLOAK_ORIGIN = "https://sso.uds.dev";
const ADMIN_KEYCLOAK_ORIGIN = "https://keycloak.admin.uds.dev";
const GRAFANA_ORIGIN = "https://grafana.admin.uds.dev";
const UNAPPROVED_ORIGIN = "https://unapproved.example";
const REDIRECT_URIS = [`${GRAFANA_ORIGIN}/login/generic_oauth`, `${GRAFANA_ORIGIN}/login`];
const excludedPackages = new Set(
  (process.env.EXCLUDED_PACKAGES ?? "")
    .split(",")
    .map(packageName => packageName.trim())
    .filter(Boolean),
);

interface KeycloakClient {
  clientId: string;
  webOrigins?: string[];
  redirectUris?: string[];
}

let clientSecret: string;

describe.skipIf(excludedPackages.has("grafana"))(
  "Grafana Keycloak SSO origin configuration",
  () => {
    beforeAll(async () => {
      const pkg = await K8s(UDSPackage).InNamespace(PACKAGE_NAMESPACE).Get("grafana");
      const sso = pkg.spec?.sso?.find(client => client.clientId === CLIENT_ID);
      expect(sso).toBeDefined();
      expect(sso?.webOrigins).toEqual([GRAFANA_ORIGIN]);
      expect(sso?.redirectUris).toEqual(REDIRECT_URIS);

      const secret = await K8s(kind.Secret)
        .InNamespace(pkg.metadata!.namespace!)
        .Get(`sso-client-${CLIENT_ID}`);
      const encodedSecret = secret.data?.secret;
      if (!encodedSecret) throw new Error("Grafana SSO client secret is missing");
      clientSecret = Buffer.from(encodedSecret, "base64").toString("utf8");
    });

    it("synchronizes only Grafana's exact origin and required redirect URIs", async () => {
      const adminToken = await getAdminToken(ADMIN_KEYCLOAK_ORIGIN);
      const response = await fetch(
        `${ADMIN_KEYCLOAK_ORIGIN}/admin/realms/uds/clients?clientId=${encodeURIComponent(CLIENT_ID)}`,
        { headers: { Authorization: `Bearer ${adminToken}` } },
      );

      expect(response.ok).toBe(true);
      const clients = (await response.json()) as KeycloakClient[];
      expect(clients).toHaveLength(1);
      expect(clients[0]?.clientId).toBe(CLIENT_ID);
      expect(clients[0]?.webOrigins).toEqual([GRAFANA_ORIGIN]);
      expect(clients[0]?.redirectUris?.slice().sort()).toEqual(REDIRECT_URIS.slice().sort());
    });

    it("rejects an unlisted redirect URI", async () => {
      const redirectUri = `${GRAFANA_ORIGIN}/unlisted`;
      const url = new URL(`${PUBLIC_KEYCLOAK_ORIGIN}/realms/uds/protocol/openid-connect/auth`);
      url.search = new URLSearchParams({
        client_id: CLIENT_ID,
        response_type: "code",
        scope: "openid",
        redirect_uri: redirectUri,
      }).toString();

      const response = await fetch(url, { redirect: "manual" });
      expect(response.status).toBe(400);
      expect(response.headers.get("location")).toBeNull();
    });

    for (const [gateway, keycloakOrigin] of [
      ["public", PUBLIC_KEYCLOAK_ORIGIN],
      ["admin", ADMIN_KEYCLOAK_ORIGIN],
    ]) {
      it(`enforces actual credentialed token-request CORS on the ${gateway} route`, async () => {
        const makeTokenRequest = (origin: string) =>
          fetch(`${keycloakOrigin}/realms/uds/protocol/openid-connect/token`, {
            method: "POST",
            headers: {
              Origin: origin,
              Authorization: `Basic ${Buffer.from(`${CLIENT_ID}:${clientSecret}`).toString("base64")}`,
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
              grant_type: "authorization_code",
              code: "invalid-code",
              redirect_uri: REDIRECT_URIS[0]!,
            }),
          });

        const approvedResponse = await makeTokenRequest(GRAFANA_ORIGIN);
        expect(approvedResponse.status).toBe(400);
        expect(approvedResponse.headers.get("access-control-allow-origin")).toBe(GRAFANA_ORIGIN);
        expect(approvedResponse.headers.get("access-control-allow-credentials")).toBe("true");

        const cacheControl = approvedResponse.headers.get("cache-control")?.toLowerCase() ?? "";
        const variesByOrigin = approvedResponse.headers
          .get("vary")
          ?.split(",")
          .some(value => value.trim().toLowerCase() === "origin");
        expect(
          variesByOrigin || cacheControl.includes("no-store") || cacheControl.includes("private"),
        ).toBe(true);

        const rejectedApprovedTokenResponse = await approvedResponse.text();
        expect(rejectedApprovedTokenResponse).not.toMatch(/"access_token"\s*:/);

        const unapprovedResponse = await makeTokenRequest(UNAPPROVED_ORIGIN);
        expect(unapprovedResponse.status).toBe(403);
        expect(unapprovedResponse.headers.get("access-control-allow-origin")).toBeNull();
        const rejectedTokenResponse = await unapprovedResponse.text();
        expect(rejectedTokenResponse).not.toMatch(/"access_token"\s*:/);
      });
    }
  },
);
