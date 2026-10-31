/**
 * Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import * as k8s from "@kubernetes/client-node";
import { describe, expect, it } from "vitest";

const publicOrigin = "https://sso.uds.dev";
const adminOrigin = "https://keycloak.admin.uds.dev";
const realmPath = "/realms/uds";
const discoveryPath = `${realmPath}/.well-known/openid-configuration`;
const oidcPath = `${realmPath}/protocol/openid-connect`;
const hstsValue = "max-age=31536000; includeSubDomains";

const spoofedForwardingHeaders = {
  Forwarded: "for=192.0.2.99;host=attacker.invalid;proto=http",
  "X-Forwarded-Host": "attacker.invalid",
  "X-Forwarded-Proto": "http",
  "X-Forwarded-Port": "81",
  "X-Forwarded-Prefix": "/attacker",
};

const kubeConfig = new k8s.KubeConfig();
kubeConfig.loadFromDefault();
const customObjects = kubeConfig.makeApiClient(k8s.CustomObjectsApi);

function expectHsts(response: Response) {
  expect(response.headers.get("strict-transport-security")).toBe(hstsValue);
}

async function hasAffinityDestinationRule(): Promise<boolean> {
  const { items } = (await customObjects.listNamespacedCustomObject({
    group: "networking.istio.io",
    version: "v1",
    namespace: "keycloak",
    plural: "destinationrules",
  })) as {
    items: {
      spec?: {
        trafficPolicy?: {
          loadBalancer?: { consistentHash?: { httpCookie?: { name?: string } } };
        };
      };
    }[];
  };

  return items.some(item =>
    item.spec?.trafficPolicy?.loadBalancer?.consistentHash?.httpCookie?.name?.endsWith("-session"),
  );
}

describe("Keycloak ingress security", () => {
  it.each([
    ["public", publicOrigin],
    ["admin", adminOrigin],
  ])(
    "keeps %s discovery URLs on their configured HTTPS hosts despite spoofed forwarding headers",
    async (_name, origin) => {
      const response = await fetch(`${origin}${discoveryPath}`, {
        headers: spoofedForwardingHeaders,
      });

      expect(response.ok).toBe(true);
      const discovery = await response.json();
      for (const [name, value] of Object.entries(discovery)) {
        if (name !== "issuer" && !name.endsWith("_endpoint") && !name.endsWith("_uri")) continue;
        if (typeof value !== "string") continue;

        const endpoint = new URL(value);
        expect([publicOrigin, adminOrigin]).toContain(endpoint.origin);
        expect(endpoint.protocol).toBe("https:");
        expect(endpoint.port).toBe("");
        expect(endpoint.pathname).not.toContain("/attacker");
      }
      expect(discovery.token_endpoint).toBe(`${origin}${oidcPath}/token`);
      expect(discovery.userinfo_endpoint).toBe(`${origin}${oidcPath}/userinfo`);
    },
  );

  it.each([
    ["public", publicOrigin],
    ["admin", adminOrigin],
  ])("sets HSTS on %s redirects, discovery, and a real static asset", async (_name, origin) => {
    const root = await fetch(`${origin}/`, { redirect: "manual" });
    expectHsts(root);

    const admin = await fetch(`${origin}/admin/`, { redirect: "manual" });
    expectHsts(admin);

    const masterRealm = await fetch(`${origin}/realms/master/`, { redirect: "manual" });
    expectHsts(masterRealm);
    if (origin === publicOrigin) {
      expect(masterRealm.status).toBe(301);
      expect(masterRealm.headers.get("location")).toBe(`${publicOrigin}/realms/uds/account`);
    } else {
      expect([200, 302]).toContain(masterRealm.status);
    }

    const discovery = await fetch(`${origin}${discoveryPath}`);
    expectHsts(discovery);

    const missingLogo = await fetch(`${origin}/public/logo.png`, { redirect: "manual" });
    expect(missingLogo.status).toBe(404);
    expectHsts(missingLogo);

    const consoleResponse = await fetch(`${adminOrigin}/admin/master/console/`);
    expect(consoleResponse.ok).toBe(true);
    const consoleHtml = await consoleResponse.text();
    const assetPath = consoleHtml.match(/(?:href|src)="([^"]*\/resources\/[^"]+)"/)?.[1];
    expect(assetPath).toBeDefined();

    const asset = await fetch(new URL(assetPath!, origin));
    expect(asset.ok).toBe(true);
    expectHsts(asset);
  });

  it.each([
    ["public", publicOrigin],
    ["admin", adminOrigin],
  ])("redirects %s HTTP requests to HTTPS", async (_name, origin) => {
    const httpOrigin = origin.replace("https://", "http://");
    const response = await fetch(`${httpOrigin}/`, { redirect: "manual" });

    expect(response.status).toBe(301);
    expect(response.headers.get("location")).toBe(`${origin}/`);
  });

  it.each([
    ["public", publicOrigin],
    ["admin", adminOrigin],
  ])(
    "keeps %s discovery Origin reflection uncached for separate origins",
    async (_name, origin) => {
      for (const requestOrigin of ["https://origin-one.invalid", "https://origin-two.invalid"]) {
        const response = await fetch(`${origin}${discoveryPath}`, {
          headers: { Origin: requestOrigin },
        });
        const cacheControl = response.headers.get("cache-control")?.toLowerCase() ?? "";
        const vary =
          response.headers
            .get("vary")
            ?.toLowerCase()
            .split(",")
            .map(value => value.trim()) ?? [];

        expect(response.ok).toBe(true);
        expect(response.headers.get("access-control-allow-origin")).toBe(requestOrigin);
        expect(cacheControl.includes("no-store") || vary.includes("origin")).toBe(true);
      }
    },
  );

  it.each([
    ["public", publicOrigin],
    ["admin", adminOrigin],
  ])("varies %s token preflight responses by reflected Origin", async (_name, origin) => {
    for (const requestOrigin of ["https://origin-one.invalid", "https://origin-two.invalid"]) {
      const response = await fetch(`${origin}${oidcPath}/token`, {
        method: "OPTIONS",
        headers: {
          Origin: requestOrigin,
          "Access-Control-Request-Method": "POST",
          "Access-Control-Request-Headers": "content-type",
        },
      });

      expect(response.ok).toBe(true);
      expect(response.headers.get("access-control-allow-origin")).toBe(requestOrigin);
      expect(
        response.headers
          .get("vary")
          ?.toLowerCase()
          .split(",")
          .map(value => value.trim()),
      ).toContain("origin");
    }
  });

  it("keeps the OIDC third-party-cookie iframe embeddable", async () => {
    const response = await fetch(`${publicOrigin}${oidcPath}/3p-cookies/step1.html`);
    const frameOptions = response.headers.get("x-frame-options")?.toLowerCase() ?? null;
    const frameAncestors = response.headers
      .get("content-security-policy")
      ?.match(/frame-ancestors[^;]*/i)?.[0];

    expect(response.ok).toBe(true);
    expect(frameOptions).toBeNull();
    expect(frameAncestors).toBeUndefined();
  });

  it("marks the Istio-generated affinity cookie Secure when HA stickiness is active", async ({
    skip,
  }) => {
    if (!(await hasAffinityDestinationRule())) {
      skip("No Keycloak affinity DestinationRule is configured");
    }

    const response = await fetch(`${publicOrigin}${discoveryPath}`);
    const setCookie = response.headers.get("set-cookie") ?? "";
    const affinityCookie = setCookie
      .split(/,(?=\s*[^;,]+=)/)
      .find(cookie => cookie.trim().startsWith("keycloak-session="));

    expect(affinityCookie).toBeDefined();
    expect(affinityCookie).toMatch(/;\s*secure(?:;|$)/i);
  });
});
