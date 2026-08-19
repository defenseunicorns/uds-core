/**
 * Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { describe, expect, test } from "vitest";

const keycloakAuthHosts = ["sso.uds.dev", "keycloak.admin.uds.dev"] as const;

interface OpenIdConfiguration {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint: string;
  jwks_uri: string;
}

describe("Keycloak reset-password URL", () => {
  test.each(keycloakAuthHosts)("uses the public hostname from %s", async host => {
    const authUrl = new URL(`https://${host}/realms/uds/protocol/openid-connect/auth`);
    authUrl.search = new URLSearchParams({
      client_id: "account",
      redirect_uri: "https://sso.uds.dev/realms/uds/account/",
      response_type: "code",
      scope: "openid",
    }).toString();

    const response = await fetch(authUrl, { redirect: "manual" });
    expect(response.status).toBe(200);
    expect(new URL(response.url).host).toBe(host);

    const html = await response.text();
    expect(html).toMatch(
      /href="https:\/\/sso\.uds\.dev\/realms\/uds\/login-actions\/reset-credentials\?/,
    );
  });

  test.each(keycloakAuthHosts)("uses the public backchannel URLs from %s", async host => {
    const discoveryUrl = `https://${host}/realms/uds/.well-known/openid-configuration`;
    const response = await fetch(discoveryUrl, { redirect: "manual" });
    expect(response.status).toBe(200);
    expect(new URL(response.url).host).toBe(host);

    const discovery = (await response.json()) as OpenIdConfiguration;
    expect(discovery.issuer).toBe("https://sso.uds.dev/realms/uds");
    for (const endpoint of [
      discovery.authorization_endpoint,
      discovery.token_endpoint,
      discovery.userinfo_endpoint,
      discovery.jwks_uri,
    ]) {
      expect(new URL(endpoint).host).toBe("sso.uds.dev");
    }
  });
});
