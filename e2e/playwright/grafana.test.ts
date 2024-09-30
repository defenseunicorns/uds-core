import { expect, test } from "@playwright/test";
import { domain } from "./uds.config";

test.use({ baseURL: `https://grafana.admin.${domain}` });

test("validate datasources", async ({ page }) => {
  await test.step("check loki", async () => {
    await page.goto(`/connections/datasources`);
    await page.click('text=Loki');
    await page.click('text=Save & test');
    await expect(page.locator('[data-testid="data-testid Alert success"]')).toBeVisible();
  });

  await test.step("check prometheus", async () => {
    await page.goto(`/connections/datasources`);
    await page.click('text=Prometheus');
    await page.click('text=Save & test');
    await expect(page.locator('[data-testid="data-testid Alert success"]')).toBeVisible();
  });
});

test("validate dashboards", async ({ page }) => {
  await test.step("Check Dashboard Existence", async () => {
    await page.goto(`/dashboards`);
    await page.click('text="Kubernetes / Compute Resources / Namespace (Pods)"');
    await page.getByTestId('data-testid Dashboard template variables Variable Value DropDown value link text authservice').click();
    await page.getByRole('checkbox', { name: 'grafana' }).click();
    await page.goto(`/dashboards`);
    await page.getByPlaceholder('Search for dashboards and folders').fill('Loki');
    await page.click('text="Loki Dashboard quick search"');
    await page.getByTestId('data-testid Dashboard template variables Variable Value DropDown value link text authservice').click();
    await page.getByRole('checkbox', { name: 'grafana' }).click();
    await expect(page.getByTestId('data-testid Panel header Logs Panel').getByTestId('data-testid panel content')).toBeVisible();
  });
});
