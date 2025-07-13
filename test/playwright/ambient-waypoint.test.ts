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
    await expect(page).toHaveURL(new RegExp(`^${url}`));

    // Verify the specific title element with text 'httpbin.org'
    const titleElement = page.locator('h2.title');
    await expect(titleElement).toContainText('httpbin.org');
  });
});
