/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { expect, test } from "@playwright/test";
import { domain } from "./uds.config";

const podinfoUrl = `https://podinfo.${domain}`;
const ssoBaseUrl = `https://sso.${domain}`;

// These tests validate the end-user behavior for the podinfo app:
// - podinfo.uds.dev is protected by Authservice and requires a login
// - the /metrics endpoint is not directly accessible to browsers/unauthenticated callers
//
// Note: Prometheus -> podinfo scraping is validated separately by the Prometheus Vitest
// e2e in test/vitest/prometheus.spec.ts, which asserts that all configured Prometheus
// targets (including podinfo monitors) are "up".

test.describe("Podinfo Authservice protection and metrics behavior", () => {
  test("podinfo is protected and login flow works", async ({ browser }) => {
    const context = await browser.newContext({ storageState: undefined });
    const page = await context.newPage();

    try {
      // Navigate to podinfo without any existing auth state; should redirect to SSO
      await page.goto(podinfoUrl);
      await page.waitForLoadState("networkidle");

      const redirectedUrl = page.url();
      expect(
        redirectedUrl.startsWith(`${ssoBaseUrl}/realms/uds/protocol/openid-connect/auth`),
      ).toBe(true);

      // Complete the Keycloak login flow
      await page.getByLabel("Username or email").fill("doug");
      await page.getByLabel("Password").fill("unicorn123!@#UN");
      await page.getByRole("button", { name: "Sign In" }).click();

      // After successful login we should be redirected back to podinfo
      await page.waitForLoadState("networkidle");
      await page.waitForURL(new RegExp(`^${podinfoUrl.replace(".", "\\.")}`), {
        timeout: 30000,
      });

      // Basic sanity check that podinfo content is rendered
      await expect(page).toHaveURL(podinfoUrl, { timeout: 10000 });

      // Verify non-error response (indicates successful JWT validation)
      const response = await page.reload();
      expect(response?.status()).toBeLessThan(400);
    } finally {
      await context.close();
    }
  });

  test("unauthenticated access to podinfo metrics is RBAC denied", async ({ browser }) => {
    const context = await browser.newContext({ storageState: undefined });
    const page = await context.newPage();

    try {
      const metricsUrl = `${podinfoUrl}/metrics`;

      // Direct unauthenticated request to the metrics endpoint should be denied by Envoy RBAC
      const response = await page.goto(metricsUrl, { waitUntil: "networkidle" });
      expect(response).not.toBeNull();
      expect(response?.status()).toBe(403);
    } finally {
      await context.close();
    }
  });
});
