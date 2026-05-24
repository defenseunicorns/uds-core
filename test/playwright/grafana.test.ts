/**
 * Copyright 2024-2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { domain, fullCore } from "./uds.config";

test.use({ baseURL: `https://grafana.admin.${domain}` });
test.describe.configure({ mode: "serial" });

async function closeGrafanaModals(page: Page) {
  const closeButton = page.getByRole("dialog").getByRole("button", { name: "Close" }).first();

  await closeButton
    .waitFor({ state: "visible", timeout: 4000 })
    .then(async () => {
      await closeButton.click();
      await expect(closeButton).toBeHidden();
    })
    .catch(() => {});
}

async function gotoGrafana(page: Page, path: string) {
  await page.goto(path);
  await closeGrafanaModals(page);
}

test("validate loki datasource", async ({ page }) => {
  test.skip(!fullCore, "Loki is only present on full core deploys");
  await test.step("check loki", async () => {
    await gotoGrafana(page, `/connections/datasources`);
    await page.getByRole("link", { name: "Loki" }).click();
    await page.click("text=Save & test");
    // Allow 40 second timeout for datasource validation
    await expect(page.locator('[data-testid="data-testid Alert success"]')).toBeVisible({
      timeout: 40000,
    });
  });
});

test("validate prometheus datasource", async ({ page }) => {
  await test.step("check prometheus", async () => {
    await gotoGrafana(page, `/connections/datasources`);
    await page.getByRole("link", { name: "Prometheus" }).click();
    await page.click("text=Save & test");
    // Allow 20 second timeout for datasource validation
    await expect(page.locator('[data-testid="data-testid Alert success"]')).toBeVisible({
      timeout: 20000,
    });
  });
});

test("validate alertmanager datasource", async ({ page }) => {
  await test.step("check alertmanager", async () => {
    await gotoGrafana(page, `/connections/datasources`);
    await page.getByRole("link", { name: "Alertmanager" }).click();
    await page.click("text=Save & test");
    // Allow 20 second timeout for datasource validation
    await expect(page.locator('[data-testid="data-testid Alert success"]')).toBeVisible({
      timeout: 20000,
    });
  });
});

// This dashboard is added by the upstream kube-prometheus-stack
test("validate namespace dashboard", async ({ page }) => {
  await test.step("check dashboard", async () => {
    await gotoGrafana(page, `/dashboards`);
    await page.click('text="Kubernetes / Compute Resources / Namespace (Pods)"');
    await page
      .getByTestId(
        "data-testid Dashboard template variables Variable Value DropDown value link text authservice",
      )
      .click();
    if (!fullCore) {
      // Check grafana if not a full core deploy
      await page.getByRole("option", { name: "grafana" }).click();
      return;
    }
    await page.getByRole("option", { name: "authservice-sidecar-test-app" }).click();
  });
});

// This dashboard is deployed "custom" by our uds config chart
test("validate loki dashboard", async ({ page }) => {
  test.skip(!fullCore, "Loki is only present on full core deploys");
  await test.step("check dashboard", async () => {
    await gotoGrafana(page, `/dashboards`);
    await page.getByPlaceholder("Search for dashboards and folders").fill("Loki");
    await page.click('text="Loki Dashboard quick search"');
    // Grafana 13+ lazy-loads variables with no saved current value, so the namespace
    // dropdown may start empty rather than preselected to "authservice". Use a partial
    // selector that matches regardless of the current displayed value.
    await page
      .locator(
        '[data-testid^="data-testid Dashboard template variables Variable Value DropDown value link text"]',
      )
      .first()
      .click();
    await page.getByRole("option", { name: "authservice-sidecar-test-app" }).click();
    await expect(
      page
        .getByTestId("data-testid Panel header Logs Panel")
        .getByTestId("data-testid panel content"),
    ).toBeVisible();
  });
});

// If these tests are failing, may indicate the dashboards need to be updated (use src/keycloak/tasks.yaml update-keycloak-grafana-dashboards to update)
// originally brought in from: https://github.com/keycloak/keycloak-grafana-dashboard
test.describe("validate Keycloak Dashboards", () => {
  const keycloakDashboards = [
    "Keycloak capacity planning dashboard",
    "Keycloak troubleshooting dashboard",
  ];

  for (const dashboard of keycloakDashboards) {
    test(`should load ${dashboard} without panel errors`, async ({ page }) => {
      const errors: string[] = [];

      // Set up console error collection
      page.on("console", msg => {
        if (msg.type() === "error") {
          const text = msg.text();
          if (
            text.includes("PanelQueryRunner Error") &&
            !text.includes("updateAndValidate error")
          ) {
            errors.push(text);
          }
        }
      });

      // Navigate to dashboards page
      await gotoGrafana(page, "/dashboards");

      // Search for the dashboard
      await page.getByPlaceholder("Search for dashboards and folders").fill("Keycloak");
      await page.click(`text="${dashboard}"`);

      // Wait for DOM to be parsed and dashboard controls to be present
      await page.waitForLoadState("domcontentloaded");
      await page.waitForSelector('[data-testid="data-testid dashboard controls"]');

      // Wait for panels to load
      await page
        .waitForSelector(".panel-loading", { state: "hidden", timeout: 15000 })
        .catch(() => console.log("No loading indicator found or already loaded"));

      // Check for any panel errors in the UI
      const panelErrors = await page.$$eval(".panel-error", elements =>
        elements.map(el => el.textContent || ""),
      );

      // Combine all errors
      const allErrors = [...errors, ...panelErrors.filter(Boolean)];

      // Assert no errors found
      expect(allErrors, `Found PanelQueryRunner errors: ${allErrors.join("\n")}`).toHaveLength(0);
    });
  }
});

// Test the logout functionality
test("validate logout functionality", async ({ page }) => {
  await test.step("perform logout", async () => {
    await gotoGrafana(page, `/`);

    await page.locator('button[aria-label="Profile"]').click();
    await page.locator("span").filter({ hasText: "Sign out" }).click();

    // After logout, we should be redirected through a series of redirects
    // First to /login/generic_oauth, then to SSO
    await page.waitForURL(/.*sso\.uds\.dev.*/, { timeout: 15000 });

    // Verify we're at the Keycloak login page
    await expect(page.locator('p:has-text("You are logged out")')).toBeVisible({ timeout: 10000 });
  });
});
