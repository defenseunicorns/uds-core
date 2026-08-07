/**
 * Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { domain, flavor, fullCore } from "./uds.config";

// Asserts the classification-banner EnvoyFilter injected its CSS-only viewport frame.
// The Lua filter previously called response_handle:body() on bodyless 3xx redirects, which
// hung the gateway response until the client disconnected. A page that loads at all with the
// banner present therefore also proves the redirect path no longer stalls.
async function expectBanner(page: Page, text: string, addFooter = true) {
  const topBanner = page.locator("#classification-banner-top");
  const pageContent = page.locator("#classification-page-content");
  const bottomBanner = page.locator("#classification-banner-bottom");

  await expect(topBanner).toBeVisible();
  await expect(topBanner).toHaveText(text);
  await expect(pageContent).toBeVisible();
  if (addFooter) {
    await expect(bottomBanner).toBeVisible();
    await expect(bottomBanner).toHaveText(text);
  } else {
    await expect(bottomBanner).toHaveCount(0);
  }
  await expect(page.locator("#classification-banner-viewport-layout")).toBeAttached();

  const layout = await page.evaluate(footerExpected => {
    const top = document.querySelector("#classification-banner-top");
    const content = document.querySelector("#classification-page-content");
    const bottom = document.querySelector("#classification-banner-bottom");

    if (!top || !content || (footerExpected && !bottom)) {
      throw new Error("Classification banner frame is incomplete");
    }

    const topRect = top.getBoundingClientRect();
    const contentRect = content.getBoundingClientRect();
    const bottomRect = bottom?.getBoundingClientRect();
    const bodyStyle = getComputedStyle(document.body);

    return {
      top: { top: topRect.top, bottom: topRect.bottom },
      content: { top: contentRect.top, bottom: contentRect.bottom },
      bottom: bottomRect ? { top: bottomRect.top, bottom: bottomRect.bottom } : null,
      bodyDisplay: bodyStyle.display,
      bodyPosition: bodyStyle.position,
      inlineScripts: Array.from(document.scripts).filter(script =>
        script.textContent?.includes("classification-banner"),
      ).length,
      viewportHeight: window.innerHeight,
    };
  }, addFooter);

  expect(layout.top.top).toBeCloseTo(0, 0);
  expect(layout.top.bottom).toBeCloseTo(24, 0);
  expect(layout.content.top).toBeCloseTo(24, 0);
  expect(layout.content.bottom).toBeCloseTo(layout.viewportHeight - (addFooter ? 24 : 0), 0);
  if (addFooter) {
    expect(layout.bottom?.top).toBeCloseTo(layout.viewportHeight - 24, 0);
    expect(layout.bottom?.bottom).toBeCloseTo(layout.viewportHeight, 0);
  } else {
    expect(layout.bottom).toBeNull();
  }
  expect(layout.bodyDisplay).toBe("grid");
  expect(layout.bodyPosition).toBe("fixed");
  expect(layout.inlineScripts).toBe(0);
}

test("sso selects the path-specific classification banner", async ({ page }) => {
  await page.goto(`https://sso.${domain}/realms/uds/account`);
  await expectBanner(page, "SAMPLE BANNER");
});

test("grafana selects the host classification banner without a footer", async ({ page }) => {
  // Grafana's root returns a 302 redirect (the case that previously hung the gateway), so
  // reaching a rendered page here exercises both the redirect and the 200 HTML inject paths.
  await page.goto(`https://grafana.admin.${domain}/`);
  await expectBanner(page, "UNKNOWN", false);
});

test("portal selects the host classification banner", async ({ page }) => {
  test.skip(
    !fullCore || flavor === "registry1",
    "Portal is not present in registry1 flavor deploys",
  );
  await page.goto(`https://portal.${domain}/`);
  await expectBanner(page, "UNCLASSIFIED");
});
