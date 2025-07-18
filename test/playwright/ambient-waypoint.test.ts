/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { expect, test } from "@playwright/test";
import { domain } from "./uds.config";

const url_client_1 = `https://ambient-protected.${domain}`;
const url_client_2 = `https://ambient2-protected.${domain}`;

test.describe("Ambient Waypoint Authentication", () => {
  const clients = [
    { name: "Client 1", url: url_client_1 },
    { name: "Client 2", url: url_client_2 },
  ];

  for (const client of clients) {
    test(`validate ${client.name} ambient waypoint authentication flow with saved session`, async ({
      page,
    }) => {
      // Navigate to the protected URL - should be automatically authenticated
      await test.step(`should load ${client.name} protected URL with saved session`, async () => {
        // Navigate and wait for network to be idle
        await page.goto(client.url, { waitUntil: "networkidle" });

        // Wait for the page to be fully loaded
        await page.waitForLoadState("domcontentloaded");
        await page.waitForLoadState("networkidle");

        // Check if we're on the expected page or if we got redirected to SSO
        const currentUrl = page.url();
        if (currentUrl.includes("sso.uds.dev")) {
          // If we're on SSO, the auth might have failed
          throw new Error(`Unexpected redirect to SSO login. Current URL: ${currentUrl}`);
        }

        // Verify we're on the protected page (not redirected to login)
        await expect(page).toHaveURL(client.url, { timeout: 5000 });

        // Wait for the title element to be visible
        const titleElement = page.locator("h2.title");
        await expect(titleElement).toBeVisible({ timeout: 10000 });
        await expect(titleElement).toContainText("httpbin.org", { timeout: 5000 });
      });
    });
  }
});

test.describe("Unauthenticated Access", () => {
  const clients = [
    { name: "Client 1", url: url_client_1 },
    { name: "Client 2", url: url_client_2 },
  ];

  for (const client of clients) {
    test(`should redirect unauthenticated users to login for ${client.name}`, async ({
      browser,
    }) => {
      // Create a new browser context without any stored authentication
      const context = await browser.newContext({
        storageState: undefined, // Ensures no saved auth state
        permissions: [], // Clear any permissions that might bypass auth
      });

      // Create a new page in this context
      const page = await context.newPage();

      try {
        // Navigate to the protected URL - this should trigger the authentication flow
        await page.goto(client.url);

        // Wait for navigation to complete and redirects to finish
        await page.waitForLoadState("networkidle");

        // Get the final URL after all redirects
        const currentUrl = page.url();

        // Check if we were redirected to the SSO login page
        // The URL contains the SSO domain and OAuth2/OIDC parameters
        const isSSOLoginPage =
          currentUrl.includes("sso.uds.dev/realms/uds/protocol/openid-connect/auth") &&
          currentUrl.includes("client_id=") &&
          currentUrl.includes("response_type=code");

        expect(
          isSSOLoginPage,
          `Expected to be redirected to SSO login page, but was on ${currentUrl}`,
        ).toBeTruthy();

        // Verify SSO login form elements are present
        if (isSSOLoginPage) {
          await expect(page.locator('input[name="username"]')).toBeVisible();
          await expect(page.locator('input[name="password"]')).toBeVisible();
        }
      } finally {
        // Clean up
        await context.close();
      }
    });
  }
});
