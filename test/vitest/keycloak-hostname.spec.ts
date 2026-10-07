/**
 * Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { describe, expect, it } from "vitest";

const publicOrigin = "https://sso.uds.dev";
const adminOrigin = "https://keycloak.admin.uds.dev";

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
