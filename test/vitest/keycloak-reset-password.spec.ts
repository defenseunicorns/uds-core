/**
 * Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import * as net from "net";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { closeForward, getForward } from "./helpers/forward";
import { getAdminToken } from "./helpers/keycloak";

const PUBLIC_HOST = "sso.uds.dev";
const ADMIN_HOST = "keycloak.admin.uds.dev";
const REALM = "uds";
const productionHostnameTestsEnabled = process.env.KEYCLOAK_PRODUCTION_HOSTNAME_TESTS === "true";

let keycloakProxy: { server: net.Server; url: string };
let adminToken: string;

function externalUrl(host: string, path: string): string {
  return `https://${host}${path}`;
}

function expectDeniedOrRedirect(status: number): void {
  expect([301, 302, 303, 307, 308, 401, 403]).toContain(status);
}

describe.skipIf(!productionHostnameTestsEnabled)("Keycloak production hostname routing", () => {
  beforeAll(async () => {
    keycloakProxy = await getForward("keycloak-http", "keycloak", 8080);
    adminToken = await getAdminToken(keycloakProxy.url);
  });

  afterAll(async () => {
    await closeForward(keycloakProxy.server);
  });

  test("publishes OIDC metadata and reset-password URLs on the public hostname", async () => {
    const discoveryResponse = await fetch(
      externalUrl(PUBLIC_HOST, `/realms/${REALM}/.well-known/openid-configuration`),
      { redirect: "manual" },
    );
    expect(discoveryResponse.status).toBe(200);

    const discovery = (await discoveryResponse.json()) as {
      issuer: string;
      authorization_endpoint: string;
      token_endpoint: string;
      userinfo_endpoint: string;
      jwks_uri: string;
    };
    expect(discovery.issuer).toBe(`https://${PUBLIC_HOST}/realms/${REALM}`);
    for (const endpoint of [
      discovery.authorization_endpoint,
      discovery.token_endpoint,
      discovery.userinfo_endpoint,
      discovery.jwks_uri,
    ]) {
      expect(new URL(endpoint).host).toBe(PUBLIC_HOST);
    }

    const authUrl = new URL(
      externalUrl(PUBLIC_HOST, `/realms/${REALM}/protocol/openid-connect/auth`),
    );
    authUrl.search = new URLSearchParams({
      client_id: "account",
      redirect_uri: `https://${PUBLIC_HOST}/realms/${REALM}/account/`,
      response_type: "code",
      scope: "openid",
    }).toString();

    const authResponse = await fetch(authUrl, { redirect: "manual" });
    expect(authResponse.status).toBe(200);
    const html = await authResponse.text();
    const resetHref = html.match(/href=\x22([^\x22]*reset-credentials\?[^\x22]*)\x22/)?.[1];
    expect(resetHref).toBeDefined();

    const resetUrl = new URL(resetHref!.replaceAll("&amp;", "&"), authUrl);
    expect(resetUrl.host).toBe(PUBLIC_HOST);
  });

  test("serves the admin API on the admin hostname for permitted traffic", async () => {
    const response = await fetch(externalUrl(ADMIN_HOST, "/admin/realms/uds"), {
      headers: { Authorization: `Bearer ${adminToken}` },
      redirect: "manual",
    });
    expect(response.status).toBe(200);
  });

  test.each(["/admin/realms/uds", "/realms/master/.well-known/openid-configuration"])(
    "does not expose %s through the public hostname",
    async path => {
      const response = await fetch(externalUrl(PUBLIC_HOST, path), { redirect: "manual" });
      expectDeniedOrRedirect(response.status);
    },
  );
});
