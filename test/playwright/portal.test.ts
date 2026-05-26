/**
 * Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { expect, test } from "@playwright/test";
import { domain, flavor, fullCore } from "./uds.config";

test.use({ baseURL: `https://portal.${domain}` });

test("validate portal loads with app grid", async ({ page }) => {
  test.skip(
    !fullCore || flavor !== "upstream",
    "Portal is only present on full core upstream deploys",
  );
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Your Apps" })).toBeVisible();
  // My Account is always injected by the portal API; verifies the grid rendered API data
  await expect(page.getByRole("link", { name: "My Account" })).toBeVisible();
});
