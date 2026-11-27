/**
 * Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */
import { describe, expect, it } from "vitest";
import { Expose, Protocol, UDSPackage } from "..";
import { getFqdn } from "../../controllers/domain-utils";
import { selectorsOverlap, validateHostAuthentication } from "./host-authentication";

function fixture() {
  const expose: Expose = {
    host: "gitlab",
    service: "webservice",
    port: 8181,
    selector: { app: "webservice" },
  };
  const pkg: UDSPackage = {
    spec: {
      network: { expose: [expose] },
      sso: [
        {
          name: "browser",
          clientId: "browser",
          authservice: { exposeHost: "gitlab" },
          redirectUris: [`https://${getFqdn(expose)}/callback`],
        },
        {
          name: "machine",
          clientId: "machine",
          machineAccess: { authserviceClientId: "browser" },
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
  it("treats an inherited JavaScript property as an absent Kubernetes label", () => {
    expect(selectorsOverlap({ constructor: "web" }, { tier: "backend" })).toBe(true);
    expect(selectorsOverlap({ constructor: "web" }, { constructor: "api" })).toBe(false);
  });
  it("accepts separate clients with an exact callback and audience", () => {
    const { pkg } = fixture();
    expect(validateHostAuthentication(pkg)).toBeUndefined();
  });
  it.each([
    "http://gitlab.uds.dev/callback",
    "https://other.uds.dev/callback",
    "/",
    "/logout",
    "/*",
  ])("rejects callback %s", callback => {
    const { pkg } = fixture();
    pkg.spec!.sso![0].redirectUris = [new URL(callback, pkg.spec!.sso![0].redirectUris![0]).href];
    expect(validateHostAuthentication(pkg)).toMatch(/callback/);
  });
  it.each<Pick<Expose, "service" | "selector">>([
    { service: "webservice", selector: { app: "different" } },
    { service: "alias", selector: { tier: "backend" } },
  ])("rejects an unprotected overlapping exposure", other => {
    const { pkg } = fixture();
    pkg.spec!.network!.expose!.push({ ...other, host: "alternate", port: 8181 });
    expect(validateHostAuthentication(pkg)).toMatch(/conflicts/);
  });
  it("rejects a missing audience mapper", () => {
    const { pkg } = fixture();
    pkg.spec!.sso![1].protocolMappers = [];
    expect(validateHostAuthentication(pkg)).toMatch(/audience/);
  });
  it("rejects a shared waypoint for disjoint Ambient clients", () => {
    const { pkg } = fixture();
    pkg.spec!.sso!.push({
      name: "legacy",
      clientId: "browser-waypoint",
      enableAuthserviceSelector: { app: "legacy" },
    });
    expect(validateHostAuthentication(pkg)).toMatch(/distinct waypoint/);
  });
  it("rejects a waypoint name that exceeds the label length limit", () => {
    const { pkg } = fixture();
    pkg.spec!.sso![0].clientId = "a".repeat(55);
    expect(validateHostAuthentication(pkg)).toMatch(/63-character/);
  });
  it("accepts browser-only hosts and multiple explicit machine clients", () => {
    const { pkg } = fixture();
    const [browser, machine] = pkg.spec!.sso!;
    pkg.spec!.sso = [browser];
    expect(validateHostAuthentication(pkg)).toBeUndefined();
    pkg.spec!.sso.push(machine, { ...machine, clientId: "second" });
    expect(validateHostAuthentication(pkg)).toBeUndefined();
  });
  it("rejects dangling references even with no exposures", () => {
    const { pkg } = fixture();
    pkg.spec!.network!.expose = [];
    expect(validateHostAuthentication(pkg)).toMatch(/exposeHost/);
    pkg.spec!.sso!.shift();
    expect(validateHostAuthentication(pkg)).toMatch(/authserviceClientId/);
  });
  it("rejects a second protecting client on one host", () => {
    const { pkg } = fixture();
    pkg.spec!.sso!.push({
      ...pkg.spec!.sso![0],
      clientId: "second-browser",
      redirectUris: [new URL("/second", pkg.spec!.sso![0].redirectUris![0]).href],
    });
    expect(validateHostAuthentication(pkg)).toMatch(/one protecting client/);
  });
  it.each([
    "redirectUris",
    "adminUrl",
    "saml_assertion_consumer_url_post",
    "saml_assertion_consumer_url_redirect",
  ])("rejects the native GitLab SAML callback declared through %s", field => {
    const { pkg, expose } = fixture();
    const callback = `https://${getFqdn(expose)}/users/auth/saml/callback`;
    pkg.spec!.sso![0].redirectUris = [callback];
    pkg.spec!.sso!.push({
      name: "GitLab",
      clientId: "gitlab-saml",
      protocol: Protocol.Saml,
      ...(field === "redirectUris"
        ? { redirectUris: [callback] }
        : field === "adminUrl"
          ? { adminUrl: callback }
          : { attributes: { [field]: callback } }),
    });
    expect(validateHostAuthentication(pkg)).toMatch(/overlaps/);
    pkg.spec!.sso![0].redirectUris = [`https://${getFqdn(expose)}/authservice/callback`];
    expect(validateHostAuthentication(pkg)).toBeUndefined();
  });
});
