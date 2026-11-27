/**
 * Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */
import { expect, test, type Page } from "@playwright/test";
import { domain } from "./uds.config";

test.use({ storageState: { cookies: [], origins: [] }, trace: "off" });

async function signInToHost(page: Page, mode: string): Promise<string> {
  const origin = `https://browser-protected-${mode}.${domain}`;
  await page.goto(origin + "/headers");
  await expect(page).toHaveURL(
    url =>
      url.hostname === `sso.${domain}` &&
      url.searchParams.get("client_id") === `host-auth-browser-${mode}` &&
      url.searchParams.get("redirect_uri") === origin + "/authservice/callback",
  );
  const callback = page.waitForRequest(req => {
    const url = new URL(req.url());
    return (
      url.origin === origin &&
      url.pathname === "/authservice/callback" &&
      url.searchParams.has("code") &&
      url.searchParams.has("state")
    );
  });
  await page.getByLabel("Username or email").fill(process.env.UDS_TEST_USERNAME ?? "doug");
  await page.getByLabel("Password").fill(process.env.UDS_TEST_PASSWORD ?? "unicorn123!@#UN");
  await page.getByRole("button", { name: "Sign In" }).click();
  await callback;
  await expect(page).toHaveURL(origin + "/headers");
  return origin;
}

for (const mode of ["ambient", "sidecar"]) {
  test.describe(`host authentication in ${mode}`, () => {
    test("authenticates a fresh session through the callback and forwards only application auth", async ({
      page,
    }) => {
      const origin = await signInToHost(page, mode);
      const response = await page.request.get(origin + "/headers", {
        headers: { Authorization: "Basic YXBwOnRlc3Q=" },
      });
      expect(response.status()).toBe(200);
      const headers = new Headers((await response.json()).headers);
      expect(headers.get("Authorization")).toBe("Basic YXBwOnRlc3Q=");
      for (const name of [
        "x-uds-machine-token",
        "x-uds-authservice-token",
        "x-uds-machine-presenter",
      ])
        expect(headers.has(name)).toBe(false);
    });
  });
}
