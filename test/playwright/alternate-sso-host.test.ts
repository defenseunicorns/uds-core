/**
 * Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { createHash, randomBytes } from "node:crypto";
import { expect, test } from "@playwright/test";
import { domain } from "./uds.config";

const alternateSsoHost = `sso-alt.${domain}`;
const protectedAppUrl = `https://alt-protected.${domain}`;
const clientId = "alt-podinfo-oidc";

function decodeJwtClaims(token: string): Record<string, unknown> {
  const payload = token.split(".")[1];
  if (!payload) {
    throw new Error("OIDC provider returned a malformed JWT");
  }
  return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
}

test("alternate-host OIDC authorization yields a token accepted by the protected app", async ({
  browser,
}) => {
  const context = await browser.newContext({ ignoreHTTPSErrors: true, storageState: undefined });
  const page = await context.newPage();
  const state = randomBytes(24).toString("base64url");
  const nonce = randomBytes(24).toString("base64url");
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  let callbackUrl: URL | undefined;
  let authorizationResponseIssuer: string | undefined;

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
    expect(discovery.issuer).toBe(`https://${alternateSsoHost}/realms/uds`);
    expect(new URL(discovery.authorization_endpoint).hostname).toBe(alternateSsoHost);
    expect(new URL(discovery.token_endpoint).hostname).toBe(alternateSsoHost);

    const pathParameterResponse = await context.request.get(
      `https://${alternateSsoHost}/realms;unexpected/uds/`,
    );
    expect(pathParameterResponse.status()).toBe(400);

    const callbackUri = `${protectedAppUrl}/callback`;
    const authorizationUrl = new URL(discovery.authorization_endpoint);
    authorizationUrl.search = new URLSearchParams({
      client_id: clientId,
      response_type: "code",
      response_mode: "query",
      scope: "openid profile email",
      redirect_uri: callbackUri,
      state,
      nonce,
      code_challenge: challenge,
      code_challenge_method: "S256",
    }).toString();

    // Observe the authorization callback only; this does not create an application session.
    await page.route(
      url => url.hostname === `alt-protected.${domain}` && url.pathname === "/callback",
      async route => {
        callbackUrl = new URL(route.request().url());
        authorizationResponseIssuer = callbackUrl.searchParams.get("iss") ?? undefined;
        await route.fulfill({
          status: 200,
          contentType: "text/html",
          body: "OIDC callback received",
        });
      },
    );

    page.on("request", request => {
      const url = new URL(request.url());
      if (url.hostname === `alt-protected.${domain}` && url.pathname === "/callback") {
        callbackUrl = url;
        authorizationResponseIssuer = url.searchParams.get("iss") ?? undefined;
      }
    });

    const observedSsoHosts = new Set<string>();
    page.on("request", request => {
      const url = new URL(request.url());
      if (url.hostname === `sso.${domain}` || url.hostname === alternateSsoHost) {
        observedSsoHosts.add(url.hostname);
      }
    });

    await page.goto(authorizationUrl.toString());
    await expect(page).toHaveURL(new RegExp(`^https://${alternateSsoHost}/realms/uds/`));
    await expect(page.getByLabel("Username or email")).toBeVisible();
    expect(
      new URL((await page.locator("form").first().getAttribute("action"))!, page.url()).hostname,
    ).toBe(alternateSsoHost);

    const alternateCookies = (
      await context.cookies(`https://${alternateSsoHost}/realms/uds/`)
    ).filter(cookie => cookie.value);
    expect(alternateCookies.length).toBeGreaterThan(0);
    expect(await context.cookies(`https://sso.${domain}/realms/uds/`)).toHaveLength(0);

    await page.getByLabel("Username or email").fill("doug");
    await page.getByLabel("Password").fill("unicorn123!@#UN");
    await page.getByRole("button", { name: "Sign In" }).click();
    await page.waitForURL(new RegExp(`^${protectedAppUrl.replaceAll(".", "\\.")}/callback\\?`));

    expect(callbackUrl?.hostname).toBe(`alt-protected.${domain}`);
    expect(callbackUrl?.searchParams.get("state")).toBe(state);
    expect(callbackUrl?.searchParams.has("code")).toBe(true);
    expect(authorizationResponseIssuer).toBe(discovery.issuer);
    expect(observedSsoHosts).toContain(alternateSsoHost);
    expect(observedSsoHosts).not.toContain(`sso.${domain}`);

    const tokenResponse = await context.request.post(discovery.token_endpoint, {
      form: {
        grant_type: "authorization_code",
        client_id: clientId,
        client_secret: "alt-issuer-regression-secret",
        redirect_uri: callbackUri,
        code: callbackUrl!.searchParams.get("code")!,
        code_verifier: verifier,
      },
    });
    expect(tokenResponse.ok()).toBe(true);
    const tokens = await tokenResponse.json();
    const idClaims = decodeJwtClaims(tokens.id_token);
    const accessClaims = decodeJwtClaims(tokens.access_token);
    console.info(
      "Alternate OIDC response and token claims",
      JSON.stringify({
        authorizationResponseIssuer,
        idToken: { iss: idClaims.iss, aud: idClaims.aud },
        accessToken: { iss: accessClaims.iss, aud: accessClaims.aud },
      }),
    );
    expect(idClaims.iss).toBe(discovery.issuer);
    expect(idClaims.aud).toContain(clientId);
    expect(accessClaims.iss).toBe(discovery.issuer);
    expect(accessClaims.aud).toContain(clientId);

    const anonymousResponse = await context.request.get(protectedAppUrl);
    expect(anonymousResponse.status()).toBe(403);

    // The app's callback is intercepted above, then this test supplies the bearer token directly.
    // This verifies the protected endpoint's JWT policy, not client-side callback/session handling.
    await context.setExtraHTTPHeaders({ Authorization: `Bearer ${tokens.access_token}` });
    const protectedResponse = await page.goto(protectedAppUrl);
    expect(protectedResponse?.status()).toBe(200);
    await expect(page).toHaveURL(protectedAppUrl);
    const reloadResponse = await page.reload();
    expect(reloadResponse?.status()).toBe(200);
    await expect(page).toHaveURL(protectedAppUrl);

    const podinfoResponse = await context.request.get(`https://podinfo.${domain}`, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    console.info(
      "Podinfo response to the alternate-issuer token",
      JSON.stringify({
        status: podinfoResponse.status(),
        server: podinfoResponse.headers()["server"],
        wwwAuthenticate: podinfoResponse.headers()["www-authenticate"],
        body: (await podinfoResponse.text()).slice(0, 300),
      }),
    );
    expect([401, 403]).toContain(podinfoResponse.status());
  } finally {
    await context.close();
  }
});
