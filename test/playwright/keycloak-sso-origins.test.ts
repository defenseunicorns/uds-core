/**
 * Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { expect, test } from "@playwright/test";
import { domain } from "./uds.config";

// The inert test pages must be allowed to reach the local k3d gateway.
test.use({ permissions: ["local-network-access"] });

const publicOrigin = `https://sso.${domain}`;
const grafanaOrigin = `https://grafana.admin.${domain}`;

for (const gateway of [publicOrigin, `https://keycloak.admin.${domain}`]) {
  for (const origin of [gateway, "https://unapproved.example"]) {
    test(`isolates account-console token requests from ${origin} through ${gateway}`, async ({
      page,
    }) => {
      // Serve an inert page at each origin without loading application code or client secrets.
      const probePage = `${origin}/sso-origin-test`;
      await page.route(probePage, route =>
        route.fulfill({ contentType: "text/html", body: "<title>CORS test</title>" }),
      );
      await page.goto(probePage);

      const result = await page.evaluate(async gateway => {
        try {
          const response = await fetch(`${gateway}/realms/uds/protocol/openid-connect/token`, {
            method: "POST",
            credentials: "include",
            body: new URLSearchParams({
              grant_type: "authorization_code",
              client_id: "account-console",
              code: "invalid-test-code",
            }),
          });
          await response.text();
          return { readable: true, status: response.status };
        } catch {
          return { readable: false };
        }
      }, gateway);

      expect(result).toEqual(
        origin === gateway ? { readable: true, status: 400 } : { readable: false },
      );
    });
  }
}

test("keeps the OIDC cookie-check iframe functional", async ({ page }) => {
  const probePage = `${grafanaOrigin}/sso-iframe-test`;
  await page.route(probePage, route =>
    route.fulfill({ contentType: "text/html", body: "<title>OIDC iframe test</title>" }),
  );
  await page.goto(probePage);
  const result = await page.evaluate(async publicOrigin => {
    return new Promise<string>(resolve => {
      const timer = setTimeout(() => resolve("timeout"), 10000);
      const frame = document.createElement("iframe");
      window.addEventListener("message", event => {
        if (
          event.origin === publicOrigin &&
          event.source === frame.contentWindow &&
          ["supported", "unsupported"].includes(event.data)
        ) {
          clearTimeout(timer);
          resolve(event.data);
        }
      });
      frame.src = `${publicOrigin}/realms/uds/protocol/openid-connect/3p-cookies/step1.html`;
      document.body.append(frame);
    });
  }, publicOrigin);
  expect(["supported", "unsupported"]).toContain(result);
});
