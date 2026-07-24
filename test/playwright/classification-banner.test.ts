/**
 * Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { domain, flavor, fullCore } from "./uds.config";

// Text injected by the classification-banner EnvoyFilter, set on the enabled hosts in
// bundles/k3d-standard/uds-bundle.yaml. SAMPLE BANNER renders as the black marking.
const BANNER_TEXT = "SAMPLE BANNER";

// Asserts the classification-banner EnvoyFilter injected its fixed header div into the page.
// The Lua filter previously called response_handle:body() on bodyless 3xx redirects, which
// hung the gateway response until the client disconnected. A page that loads at all with the
// banner present therefore also proves the redirect path no longer stalls.
async function expectBanner(page: Page) {
  const banner = page.locator("#classification-banner-top");
  await expect(banner).toBeVisible();
  await expect(banner).toHaveText(BANNER_TEXT);
}

test("sso shows the classification banner", async ({ page }) => {
  await page.goto(`https://sso.${domain}/realms/uds/account`);
  await expectBanner(page);
});

test("grafana shows the classification banner", async ({ page }) => {
  // Grafana's root returns a 302 redirect (the case that previously hung the gateway), so
  // reaching a rendered page here exercises both the redirect and the 200 HTML inject paths.
  await page.goto(`https://grafana.admin.${domain}/`);
  await expectBanner(page);
});

test("portal shows the classification banner", async ({ page }) => {
  test.skip(
    !fullCore || flavor === "registry1",
    "Portal is not present in registry1 flavor deploys",
  );
  await page.goto(`https://portal.${domain}/`);
  await expectBanner(page);
});
