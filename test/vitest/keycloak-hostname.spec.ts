/**
 * Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { describe, expect, it } from "vitest";
import { closeForward, getForward } from "./helpers/forward";

const publicOrigin = "https://sso.uds.dev";
const adminOrigin = "https://keycloak.admin.uds.dev";
const internalHost = "keycloak-http.keycloak.svc.cluster.local";

describe("Keycloak hostname routing", () => {
  it("uses the public origin for public realm discovery", async () => {
    const response = await fetch(`${publicOrigin}/realms/uds/.well-known/openid-configuration`);

    expect(response.ok).toBe(true);
    await expect(response.json()).resolves.toMatchObject({
      issuer: `${publicOrigin}/realms/uds`,
    });
  });

  it("uses the admin origin for admin realm discovery", async () => {
    const response = await fetch(`${adminOrigin}/realms/uds/.well-known/openid-configuration`);

    expect(response.ok).toBe(true);
    await expect(response.json()).resolves.toMatchObject({
      issuer: `${adminOrigin}/realms/uds`,
    });
  });

  it("preserves the internal realm issuer used by projected service account tokens", async () => {
    const forward = await getForward("keycloak-http", "keycloak", 8080);
    try {
      const response = await fetch(`${forward.url}/realms/uds/.well-known/openid-configuration`, {
        headers: {
          Host: `${internalHost}:8080`,
          "X-Forwarded-Host": internalHost,
          "X-Forwarded-Proto": "http",
          "X-Forwarded-Port": "80",
        },
      });

      expect(response.ok).toBe(true);
      await expect(response.json()).resolves.toMatchObject({
        issuer: `http://${internalHost}/realms/uds`,
      });
    } finally {
      await closeForward(forward.server);
    }
  });

  it("keeps private admin paths redirected on the public gateway", async () => {
    const response = await fetch(`${publicOrigin}/admin/`, { redirect: "manual" });
    const location = response.headers.get("location");

    expect([301, 302]).toContain(response.status);
    expect(location).toBe(`${publicOrigin}/realms/uds/account`);
  });

  it("keeps the admin console frontend origin on the admin host", async () => {
    const response = await fetch(`${adminOrigin}/admin/master/console/`);
    const body = await response.text();

    expect(response.ok).toBe(true);
    expect(body).toContain(`"serverBaseUrl": "${adminOrigin}"`);
    expect(body).not.toContain(`"serverBaseUrl": "${publicOrigin}"`);
  });
});
