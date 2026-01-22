/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { expect, test } from "@playwright/test";

// Private PKI tests to verify SSO flows
test.describe("Private PKI tests", () => {
  test("Grafana SSO authentication flow", async ({ page }) => {
    // Step 1: Navigate to Grafana which should redirect to Keycloak
    await page.goto(`https://grafana.admin.uds.dev`);

    // Step 2: Verify redirect to Keycloak
    await expect(page).toHaveURL(
      new RegExp(`^https://sso\\.uds\\.dev\\/realms/uds/protocol/openid-connect/auth`),
    );

    // Step 3: Login with test credentials
    await page.getByLabel("Username or email").fill("doug");
    await page.getByLabel("Password").fill("unicorn123!@#UN");
    await page.getByRole("button", { name: "Sign In" }).click();

    // Step 5: After successful authentication, we should be at Grafana
    await expect(page).toHaveURL(new RegExp(`^https://grafana\\.admin\\.uds\\.dev`), {
      timeout: 10000,
    });
  });

  test("Authservice protected app SSO authentication flow", async ({ page }) => {
    // Step 1: Navigate to protected app which should redirect to Keycloak
    await page.goto(`https://ambient-protected.uds.dev`);

    // Step 2: Verify redirect to Keycloak
    await expect(page).toHaveURL(
      new RegExp(`^https://sso\\.uds\\.dev\\/realms/uds/protocol/openid-connect/auth`),
    );

    // Step 3: Login with test credentials
    await page.getByLabel("Username or email").fill("doug");
    await page.getByLabel("Password").fill("unicorn123!@#UN");
    await page.getByRole("button", { name: "Sign In" }).click();

    // Step 5: After successful authentication
    await expect(page).toHaveURL(new RegExp(`^https://ambient-protected\\.uds\\.dev`), {
      timeout: 10000,
    });
  });
});
