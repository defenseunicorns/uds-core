/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { expect, test } from "@playwright/test";
import { domain } from "./uds.config";

test.use({ baseURL: `https://neuvector.admin.${domain}` });

test("validate system health", async ({ page }) => {
  await test.step("check sso", async () => {
    await page.goto('/#/login');
    await page.locator('.mat-checkbox-inner-container').click();
    await page.getByRole('button', { name: 'Login with OpenID' }).click();
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    await expect(page).toHaveURL('/#/dashboard');
  });

  // Expect counts for scanner, controller, enforcer are based on chart defaults
  await test.step("check system components", async () => {
    await page.goto('/#/controllers');
    await page.waitForLoadState("domcontentloaded");

    // Ensure at least three scanners are connected and at least one scan complete
    await page.getByRole('tab', { name: 'Scanners' }).click();
    await expect(page.locator('app-scanners-grid')).toHaveText(/[3-9]/, { timeout: 20000 });
    await expect(page.getByRole('gridcell').first()).toHaveText(/[1-9]*/, { timeout: 20000 });

    // Ensure at least one controller exists and all are connected
    await page.getByRole('tab', { name: 'Controllers' }).click();
    const controllers = await page.locator('div[role="row"] > div[col-id="connection_state"] > app-controllers-grid-status-cell > span');
    await expect(await controllers.count()).toBeGreaterThanOrEqual(3);
    for (const controller of await controllers.all()) {
      await expect(controller).toHaveText("Connected");
    }

    // Ensure at least one enforcer exists and all are connected
    await page.getByRole('tab', { name: 'Enforcers' }).click();
    const enforcers = await page.locator('div[role="row"] > div[col-id="connection_state"] > app-enforcers-grid-status-cell > span');
    await expect(await enforcers.count()).toBeGreaterThanOrEqual(1);
    for (const enforcer of await enforcers.all()) {
      await expect(enforcer).toHaveText("Connected");
    }
  });
});

test("validate local login is blocked", async ({ page }) => {
  await test.step("check local login", async () => {
    await page.goto('/#/login');
    await page.locator('.mat-checkbox-inner-container').click();
    await page.locator('#Email1').fill('admin');
    await page.locator('#password1').fill('admin');
    await page.getByRole('button', { name: 'Login', exact: true }).click();
    await expect(page.getByText('RBAC: access denied')).toBeVisible();
  });
});
