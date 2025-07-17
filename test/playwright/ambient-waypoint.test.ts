/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { expect, test } from "@playwright/test";
import { domain } from "./uds.config";

const url = `https://ambient-protected.${domain}`;

test("validate ambient waypoint authentication flow with saved session", async ({ page }) => {
  // The auth.setup.ts will handle the authentication automatically because:
  // 1. The test is marked with 'setup' dependency in playwright.config.ts
  // 2. The storage state is automatically loaded from authFile

  // Navigate to the protected URL - should be automatically authenticated
  await test.step("should load protected URL with saved session", async () => {
    await page.goto(url);

    // Verify we're on the protected page (not redirected to login)
    await expect(page).toHaveURL(url, { timeout: 5000 });

    // Verify the specific title element with text 'httpbin.org'
    const titleElement = page.locator("h2.title");
    await expect(titleElement).toContainText("httpbin.org");
  });
});

test("should redirect unauthenticated users to login", async ({ browser }) => {
  // Create a new browser context without any stored authentication
  const context = await browser.newContext({
    storageState: undefined, // Ensures no saved auth state
    permissions: [], // Clear any permissions that might bypass auth
  });

  // Create a new page in this context
  const page = await context.newPage();

  try {
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
