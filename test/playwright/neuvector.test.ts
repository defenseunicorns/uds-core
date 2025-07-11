/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { expect, test } from "@playwright/test";
import { domain } from "./uds.config";

const FIFTEEN_SECONDS = 15_000;

const url = `https://neuvector.admin.${domain}`;
test.use({ baseURL: url });

test("validate system health", async ({ page }) => {
  await test.step("check sso", async () => {
    await page.goto("/#/login");
    await page.waitForLoadState("domcontentloaded");

    await expect(page.getByRole("button", { name: "Login with OpenID" })).toBeVisible();
    const termsCheckbox = await page.locator(".mat-checkbox-inner-container");
    if (await termsCheckbox.isVisible()) {
      await termsCheckbox.click();
    }
    await page.getByRole("button", { name: "Login with OpenID" }).click();
    await expect(page).toHaveURL("/#/dashboard");
    await expect(page.locator(".navbar-header")).toBeVisible();
  });

  // Expect counts for scanner, controller, enforcer are based on chart defaults
  await test.step("check system components", async () => {
    await page.goto("/#/controllers");
    await page.waitForLoadState("domcontentloaded");

    // Ensure at least three scanners are connected and at least one scan complete
    await page.getByRole("tab", { name: "Scanners" }).click();
    await page.waitForLoadState("domcontentloaded");
    const scannerPromise = page.waitForResponse(`${url}/scanner`);
    await page.getByLabel("Scanners").getByRole("button", { name: "refresh Refresh" }).click();
    const scannerResponse = await scannerPromise;
    const scannerData = await scannerResponse.json();

    expect(scannerData).toHaveProperty("scanners");
    expect(Array.isArray(scannerData.scanners)).toBe(true);
    expect(scannerData.scanners.length).toBeGreaterThanOrEqual(3);

    // Ensure at least three controller exists and all are connected
    await page.getByRole("tab", { name: "Controllers" }).click();
    await page.waitForLoadState("domcontentloaded");
    const controllerPromise = page.waitForResponse(`${url}/controller`);
    await page.getByLabel("Controllers").getByRole("button", { name: "refresh Refresh" }).click();
    const controllerResponse = await controllerPromise;
    const controllerData = await controllerResponse.json();

    expect(controllerData).toHaveProperty("controllers");
    expect(Array.isArray(controllerData.controllers)).toBe(true);
    expect(controllerData.controllers.length).toBeGreaterThanOrEqual(3);
    controllerData.controllers.forEach((controller: { connection_state: string }) => {
      expect(controller.connection_state).toBe("connected");
    });

    // Ensure at least one enforcer exists and all are connected
    await page.getByRole("tab", { name: "Enforcers" }).click();
    await page.waitForLoadState("domcontentloaded");
    const enforcerPromise = page.waitForResponse(`${url}/enforcer`);
    await page.getByLabel("Enforcers").getByRole("button", { name: "refresh Refresh" }).click();
    const enforcerResponse = await enforcerPromise;
    const enforcerData = await enforcerResponse.json();

    expect(enforcerData).toHaveProperty("enforcers");
    expect(Array.isArray(enforcerData.enforcers)).toBe(true);
    expect(enforcerData.enforcers.length).toBeGreaterThanOrEqual(1);
    enforcerData.enforcers.forEach((enforcer: { connection_state: string }) => {
      expect(enforcer.connection_state).toBe("connected");
    });
  });

  await test.step("check scanning functionality", async () => {
    await page.goto("/#/workloads");
    await page.waitForLoadState("domcontentloaded");

    // Pick the first istio-proxy image to scan
    await page.getByText("istio-proxy").first().click();
    const scannerPromise = page.waitForResponse(`${url}/workload/scanned*`);
    await page.getByRole("button", { name: "Scan action" }).click();
    const scannerResponse = await scannerPromise;
    expect(scannerResponse.status()).toBe(200);
  });
});

test("validate local login is blocked", async ({ page }) => {
  await test.step("check local login", async () => {
    await page.goto("/#/login");
    await page.locator(".mat-checkbox-inner-container").click();
    await page.locator("#Email1").fill("admin");
    await page.locator("#password1").fill("admin");
    await page.getByRole("button", { name: "Login", exact: true }).click();
    await expect(page.getByText("RBAC: access denied")).toBeVisible();
  });
});

// Add a 15 second delay after a test failure
test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status === testInfo.expectedStatus || testInfo.retry === testInfo.project.retries) {
    return;
  }

  testInfo.setTimeout(testInfo.timeout + FIFTEEN_SECONDS);
  console.info(`Backoff: waiting 15s before the next test retry`);
  await page.waitForTimeout(FIFTEEN_SECONDS);
});
