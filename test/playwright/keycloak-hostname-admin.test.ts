/**
 * Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { expect, test } from "@playwright/test";

const publicOrigin = "https://sso.uds.dev";
const adminOrigin = "https://keycloak.admin.uds.dev";

test.describe("Keycloak admin hostname behavior", () => {
  test("uses the primary public host for realm discovery", async ({ browser }) => {
    const context = await browser.newContext({ ignoreHTTPSErrors: true });

    try {
      const response = await context.request.get(
        `${publicOrigin}/realms/uds/.well-known/openid-configuration`,
      );

      expect(response.ok()).toBe(true);
      await expect(response.json()).resolves.toMatchObject({
        issuer: `${publicOrigin}/realms/uds`,
      });
    } finally {
      await context.close();
    }
  });

  test("uses the request host for discovery through the admin gateway", async ({ browser }) => {
    const context = await browser.newContext({ ignoreHTTPSErrors: true });

    try {
      const response = await context.request.get(
        `${adminOrigin}/realms/uds/.well-known/openid-configuration`,
      );

      expect(response.ok()).toBe(true);
      await expect(response.json()).resolves.toMatchObject({
        issuer: `${adminOrigin}/realms/uds`,
      });
    } finally {
      await context.close();
    }
  });

  test("keeps private admin paths redirected on the public gateway", async ({ browser }) => {
    const context = await browser.newContext({ ignoreHTTPSErrors: true });

    try {
      const response = await context.request.get(`${publicOrigin}/admin/`, { maxRedirects: 0 });

      expect([301, 302]).toContain(response.status());
      expect(response.headers().location).toBe(`${publicOrigin}/realms/uds/account`);
    } finally {
      await context.close();
    }
  });

  test("keeps the admin console frontend origin on the admin host", async ({ browser }) => {
    const context = await browser.newContext({ ignoreHTTPSErrors: true });

    try {
      const response = await context.request.get(`${adminOrigin}/admin/master/console/`);
      const body = await response.text();

      expect(response.ok()).toBe(true);
      expect(body).toContain(`"serverBaseUrl": "${adminOrigin}"`);
      expect(body).not.toContain(`"serverBaseUrl": "${publicOrigin}"`);
    } finally {
      await context.close();
    }
  });
});
