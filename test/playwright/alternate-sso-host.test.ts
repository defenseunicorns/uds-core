/**
 * Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { expect, test } from "@playwright/test";
import { domain } from "./uds.config";

const alternateSsoHost = `sso-alt.${domain}`;
const alternateSsoIssuer = `https://${alternateSsoHost}/realms/uds`;
const protectedAppUrl = `https://alt-protected.${domain}`;
const clientId = "alt-podinfo-oidc";

function decodeJwtClaims(token: string): Record<string, unknown> {
  const payload = token.split(".")[1];
  if (!payload) {
    throw new Error("OIDC provider returned a malformed JWT");
  }
  return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
}

function getHeader(headers: Record<string, unknown>, name: string): string {
  const matchingHeader = Object.entries(headers).find(
    ([key]) => key.toLowerCase() === name.toLowerCase(),
  );
  const value = matchingHeader?.[1];
  const header = Array.isArray(value) ? value[0] : value;
  expect(typeof header).toBe("string");
  return header as string;
}

test("alternate-host OIDC login creates a protected-app session", async ({ browser }) => {
  const context = await browser.newContext({ ignoreHTTPSErrors: true, storageState: undefined });
  const page = await context.newPage();
  let callbackUrl: URL | undefined;

  try {
    const discoveryResponse = await context.request.get(
      `https://${alternateSsoHost}/realms/uds/.well-known/openid-configuration`,
      {
        headers: {
          "X-Forwarded-Host": "attacker.example",
          "X-Forwarded-Port": "8443",
          "X-Forwarded-Prefix": "/attacker",
          "X-Forwarded-Proto": "http",
        },
      },
    );
    expect(discoveryResponse.ok()).toBe(true);
    const discovery = await discoveryResponse.json();
    expect(discovery.issuer).toBe(alternateSsoIssuer);
    expect(new URL(discovery.authorization_endpoint).hostname).toBe(alternateSsoHost);
    expect(new URL(discovery.token_endpoint).hostname).toBe(alternateSsoHost);

    const pathParameterResponse = await context.request.get(
      `https://${alternateSsoHost}/realms;unexpected/uds/`,
    );
    expect(pathParameterResponse.status()).toBe(400);

    page.on("request", request => {
      const url = new URL(request.url());
      if (url.hostname === `alt-protected.${domain}` && url.pathname === "/oauth2/callback") {
        callbackUrl = url;
      }
    });

    // This context has no saved login state. The protected app must begin OIDC at sso-alt.
    await page.goto(protectedAppUrl);
    await expect(page).toHaveURL(new RegExp(`^https://${alternateSsoHost}/realms/uds/`));
    await expect(page.getByLabel("Username or email")).toBeVisible();
    expect(await context.cookies(`https://sso.${domain}/realms/uds/`)).toHaveLength(0);

    const alternateCookies = (
      await context.cookies(`https://${alternateSsoHost}/realms/uds/`)
    ).filter(cookie => cookie.value);
    expect(alternateCookies.length).toBeGreaterThan(0);

    await page.getByLabel("Username or email").fill("doug");
    await page.getByLabel("Password").fill("unicorn123!@#UN");
    await page.getByRole("button", { name: "Sign In" }).click();
    await page.waitForURL(new RegExp(`^${protectedAppUrl.replaceAll(".", "\\.")}/?$`));

    expect(callbackUrl?.hostname).toBe(`alt-protected.${domain}`);
    expect(callbackUrl?.pathname).toBe("/oauth2/callback");
    expect(callbackUrl?.searchParams.has("code")).toBe(true);
    expect(callbackUrl?.searchParams.has("state")).toBe(true);
    expect(callbackUrl?.searchParams.get("iss")).toBe(discovery.issuer);

    // oauth2-proxy sets its own app cookie after validating the callback and token issuer.
    const appCookies = await context.cookies(protectedAppUrl);
    expect(
      appCookies.some(cookie => cookie.name === "__Host-alt-oauth2-proxy" && cookie.value),
    ).toBe(true);
    await expect(page.locator("body")).toContainText("greetings from podinfo");

    // The test-only upstream exposes the OIDC client tokens for issuer and audience assertions.
    const headersResponse = await context.request.get(`${protectedAppUrl}/headers`);
    expect(headersResponse.ok()).toBe(true);
    const upstreamHeaders = (await headersResponse.json()) as Record<string, unknown>;
    const accessToken = getHeader(upstreamHeaders, "X-Forwarded-Access-Token");
    const authorizationHeader = getHeader(upstreamHeaders, "Authorization");
    expect(authorizationHeader.startsWith("Bearer ")).toBe(true);
    const idClaims = decodeJwtClaims(authorizationHeader.slice("Bearer ".length));
    const accessClaims = decodeJwtClaims(accessToken);

    console.info(
      "Alternate OIDC response and token claims",
      JSON.stringify({
        authorizationResponseIssuer: callbackUrl?.searchParams.get("iss"),
        idToken: { iss: idClaims.iss, aud: idClaims.aud },
        accessToken: { iss: accessClaims.iss, aud: accessClaims.aud },
      }),
    );
    expect(idClaims.iss).toBe(discovery.issuer);
    expect(idClaims.aud).toContain(clientId);
    expect(accessClaims.iss).toBe(discovery.issuer);
    expect(accessClaims.aud).toContain(clientId);

    // The app session must work on reload without the test injecting a bearer token.
    const reloadResponse = await page.reload();
    expect(reloadResponse?.status()).toBe(200);
    await expect(page).toHaveURL(protectedAppUrl);
    await expect(page.locator("body")).toContainText("greetings from podinfo");

    const primaryPodinfoResponse = await context.request.get(`https://podinfo.${domain}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    console.info(
      "Podinfo response to the alternate-issuer token",
      JSON.stringify({
        status: primaryPodinfoResponse.status(),
        server: primaryPodinfoResponse.headers()["server"],
        wwwAuthenticate: primaryPodinfoResponse.headers()["www-authenticate"],
        body: (await primaryPodinfoResponse.text()).slice(0, 300),
      }),
    );
    expect([401, 403]).toContain(primaryPodinfoResponse.status());
  } finally {
    await context.close();
  }
});
