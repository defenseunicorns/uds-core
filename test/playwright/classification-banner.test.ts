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

// Asserts the classification-banner EnvoyFilter injected its CSS-only viewport frame.
// The Lua filter previously called response_handle:body() on bodyless 3xx redirects, which
// hung the gateway response until the client disconnected. A page that loads at all with the
// banner present therefore also proves the redirect path no longer stalls.
async function expectBanner(page: Page) {
  const topBanner = page.locator("#classification-banner-top");
  const pageContent = page.locator("#classification-page-content");
  const bottomBanner = page.locator("#classification-banner-bottom");

  await expect(topBanner).toBeVisible();
  await expect(topBanner).toHaveText(BANNER_TEXT);
  await expect(pageContent).toBeVisible();
  await expect(bottomBanner).toBeVisible();
  await expect(bottomBanner).toHaveText(BANNER_TEXT);
  await expect(page.locator("#classification-banner-viewport-layout")).toBeAttached();

  const layout = await page.evaluate(() => {
    const top = document.querySelector("#classification-banner-top");
    const content = document.querySelector("#classification-page-content");
    const bottom = document.querySelector("#classification-banner-bottom");

    if (!top || !content || !bottom) {
      throw new Error("Classification banner frame is incomplete");
    }

    const topRect = top.getBoundingClientRect();
    const contentRect = content.getBoundingClientRect();
    const bottomRect = bottom.getBoundingClientRect();
    const bodyStyle = getComputedStyle(document.body);

    return {
      top: { top: topRect.top, bottom: topRect.bottom },
      content: { top: contentRect.top, bottom: contentRect.bottom },
      bottom: { top: bottomRect.top, bottom: bottomRect.bottom },
      bodyDisplay: bodyStyle.display,
      bodyPosition: bodyStyle.position,
      inlineScripts: Array.from(document.scripts).filter(script =>
        script.textContent?.includes("classification-banner"),
      ).length,
      viewportHeight: window.innerHeight,
    };
  });

  expect(layout.top.top).toBeCloseTo(0, 0);
  expect(layout.top.bottom).toBeCloseTo(24, 0);
  expect(layout.content.top).toBeCloseTo(24, 0);
  expect(layout.content.bottom).toBeCloseTo(layout.viewportHeight - 24, 0);
  expect(layout.bottom.top).toBeCloseTo(layout.viewportHeight - 24, 0);
  expect(layout.bottom.bottom).toBeCloseTo(layout.viewportHeight, 0);
  expect(layout.bodyDisplay).toBe("grid");
  expect(layout.bodyPosition).toBe("fixed");
  expect(layout.inlineScripts).toBe(0);
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
