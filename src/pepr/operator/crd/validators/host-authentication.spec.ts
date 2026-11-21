/**
 * Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */
import { describe, expect, it } from "vitest";
import { Expose, Protocol, UDSPackage } from "..";
import { getFqdn } from "../../controllers/domain-utils";
import { validateHostAuthentication } from "./host-authentication";

function fixture() {
  const expose: Expose = {
    host: "gitlab",
    service: "webservice",
    port: 8181,
    selector: { app: "webservice" },
    authentication: { mode: "authservice", ssoClientId: "browser", machineClientId: "machine" },
  };
  const pkg: UDSPackage = {
    spec: {
      network: { expose: [expose] },
      sso: [
        {
          name: "browser",
          clientId: "browser",
          redirectUris: [`https://${getFqdn(expose)}/callback`],
        },
        {
          name: "machine",
          clientId: "machine",
          standardFlowEnabled: false,
          serviceAccountsEnabled: true,
          protocolMappers: [
            {
              name: "audience",
              protocol: Protocol.OpenidConnect,
              protocolMapper: "oidc-audience-mapper",
              config: { "access.token.claim": "true", "included.client.audience": "browser" },
            },
          ],
        },
      ],
    },
  };
  return { pkg, expose };
}

describe("host authentication admission", () => {
  it("accepts separate clients with an exact callback and audience", () => {
    const { pkg, expose } = fixture();
    expect(validateHostAuthentication(pkg, expose)).toBeUndefined();
  });
  it.each([
    "http://gitlab.uds.dev/callback",
    "https://other.uds.dev/callback",
    "/",
    "/logout",
    "/*",
  ])("rejects callback %s", callback => {
    const { pkg, expose } = fixture();
    pkg.spec!.sso![0].redirectUris = [new URL(callback, `https://${getFqdn(expose)}`).href];
    expect(validateHostAuthentication(pkg, expose)).toMatch(/callback/);
  });
  it.each<Pick<Expose, "service" | "selector">>([
    { service: "webservice", selector: { app: "different" } },
    { service: "alias", selector: { tier: "backend" } },
  ])("rejects an unprotected overlapping exposure", other => {
    const { pkg, expose } = fixture();
    pkg.spec!.network!.expose!.push({ ...other, host: "alternate", port: 8181 });
    expect(validateHostAuthentication(pkg, expose)).toMatch(/conflicts/);
  });
  it("rejects a missing audience mapper", () => {
    const { pkg, expose } = fixture();
    pkg.spec!.sso![1].protocolMappers = [];
    expect(validateHostAuthentication(pkg, expose)).toMatch(/audience/);
  });
});
