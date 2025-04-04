/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { expect, test } from "@playwright/test";
import { domain, fullCore } from "./uds.config";

test.use({ baseURL: `https://grafana.admin.${domain}` });
test.describe.configure({ mode: 'serial' });

test("validate loki datasource", async ({ page }) => {
  test.skip(!fullCore, "Loki is only present on full core deploys");
  await test.step("check loki", async () => {
    await page.goto(`/connections/datasources`);
    await page.getByRole('link', { name: 'Loki' }).click();
    await page.click('text=Save & test');
    // Allow 40 second timeout for datasource validation
    await expect(page.locator('[data-testid="data-testid Alert success"]')).toBeVisible({ timeout: 40000 });
  });
});

test("validate prometheus datasource", async ({ page }) => {
  await test.step("check prometheus", async () => {
    await page.goto(`/connections/datasources`);
    await page.getByRole('link', { name: 'Prometheus' }).click();
    await page.click('text=Save & test');
    // Allow 20 second timeout for datasource validation
    await expect(page.locator('[data-testid="data-testid Alert success"]')).toBeVisible({ timeout: 20000 });
  });
});

test("validate alertmanager datasource", async ({ page }) => {
  await test.step("check alertmanager", async () => {
    await page.goto(`/connections/datasources`);
    await page.getByRole('link', { name: 'Alertmanager' }).click();
    await page.click('text=Save & test');
    // Allow 20 second timeout for datasource validation
    await expect(page.locator('[data-testid="data-testid Alert success"]')).toBeVisible({ timeout: 20000 });
  });
});

// This dashboard is added by the upstream kube-prometheus-stack
test("validate namespace dashboard", async ({ page }) => {
  await test.step("check dashboard", async () => {
    await page.goto(`/dashboards`);
    await page.click('text="Kubernetes / Compute Resources / Namespace (Pods)"');
    await page.getByTestId('data-testid Dashboard template variables Variable Value DropDown value link text authservice').click();
    await page.getByRole('option', { name: 'authservice-test-app' }).click();
  });
});

// This dashboard is deployed "custom" by our uds config chart
test("validate loki dashboard", async ({ page }) => {
  test.skip(!fullCore, "Loki is only present on full core deploys");
  await test.step("check dashboard", async () => {
    await page.goto(`/dashboards`);
    await page.getByPlaceholder('Search for dashboards and folders').fill('Loki');
    await page.click('text="Loki Dashboard quick search"');
    await page.getByTestId('data-testid Dashboard template variables Variable Value DropDown value link text authservice').click();
    await page.getByRole('option', { name: 'authservice-test-app' }).click();
    await expect(page.getByTestId('data-testid Panel header Logs Panel').getByTestId('data-testid panel content')).toBeVisible();
  });
});
