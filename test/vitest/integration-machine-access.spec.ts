/**
 * Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const kubectl = (args: string[], input?: string) =>
  execFileSync("kubectl", args, { input, encoding: "utf8" });

describe.each(["sidecar", "ambient"])("host authentication in %s", mode => {
  const ns = `host-auth-${mode}-${randomUUID().slice(0, 8)}`;
  const origin = `https://${ns}.uds.dev`;
  const machine = `${ns}-machine`;
  const browser = `${ns}-browser`;
  const otherMachine = ns + "-other";
  let token: string;
  let otherToken: string;
  let uid: string;
  let created = false;
  const get = (headers: HeadersInit) => fetch(origin + "/headers", { headers, redirect: "manual" });

  beforeAll(async () => {
    kubectl(["create", "namespace", ns]);
    created = true;
    // Zarf provisions this pull secret for packaged namespaces. The fixture creates its own.
    const { data, type } = JSON.parse(
      kubectl(["get", "secret", "private-registry", "-n", "zarf", "-o", "json"]),
    );
    kubectl(
      ["create", "-f", "-"],
      JSON.stringify({
        apiVersion: "v1",
        kind: "Secret",
        metadata: { name: "private-registry", namespace: ns },
        data,
        type,
      }),
    );
    const fixture = readFileSync(
      new URL("../../src/test/app-sidecar-authservice-tenant.yaml", import.meta.url),
      "utf8",
    ).replaceAll("authservice-sidecar-test-app", ns);
    kubectl(["apply", "-f", "-"], fixture.split("---").slice(0, 2).join("---"));
    kubectl(
      ["apply", "-f", "-"],
      JSON.stringify({
        apiVersion: "uds.dev/v1alpha1",
        kind: "Package",
        metadata: { name: ns, namespace: ns },
        spec: {
          network: {
            serviceMesh: { mode },
            expose: [
              {
                host: ns,
                service: "httpbin",
                port: 8000,
                targetPort: 80,
                selector: { app: "httpbin" },
                authentication: {
                  mode: "authservice",
                  ssoClientId: browser,
                  machineClientId: machine,
                },
              },
            ],
          },
          sso: [
            { name: browser, clientId: browser, redirectUris: [origin + "/authservice/callback"] },
            ...[machine, otherMachine].map(clientId => ({
              name: clientId,
              clientId,
              standardFlowEnabled: false,
              serviceAccountsEnabled: true,
              secretConfig: { name: clientId, template: { client_secret: "clientField(secret)" } },
              protocolMappers: [
                {
                  name: "audience",
                  protocol: "openid-connect",
                  protocolMapper: "oidc-audience-mapper",
                  config: { "included.client.audience": browser, "access.token.claim": "true" },
                },
              ],
            })),
          ],
        },
      }),
    );
    kubectl([
      "wait",
      "-n",
      ns,
      "package/" + ns,
      "--for=jsonpath={.status.phase}=Ready",
      "--timeout=240s",
    ]);
    kubectl(["apply", "-f", "-"], fixture);
    kubectl(["rollout", "status", "deployment/httpbin", "-n", ns, "--timeout=180s"]);
    uid = kubectl(["-n", ns, "get", "package", ns, "-o", "jsonpath={.metadata.uid}"]);
    [token, otherToken] = await Promise.all([machine, otherMachine].map(accessToken));
  }, 480000);

  async function accessToken(clientId: string) {
    const secret = Buffer.from(
      kubectl(["-n", ns, "get", "secret", clientId, "-o", "jsonpath={.data.client_secret}"]),
      "base64",
    ).toString();
    const response = await fetch("https://sso.uds.dev/realms/uds/protocol/openid-connect/token", {
      method: "POST",
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: secret,
      }),
    });
    expect(response.status).toBe(200);
    return (await response.json()).access_token as string;
  }

  afterAll(async () => {
    if (!created) return;
    kubectl(["delete", "namespace", ns, "--wait=false"]);
    if (uid)
      await vi.waitFor(
        () => {
          expect(
            kubectl([
              "get",
              "authorizationpolicy,requestauthentication",
              "-n",
              "istio-tenant-gateway",
              "-l",
              "uds.dev/host-auth-package=" + uid,
              "-o",
              "name",
            ]),
          ).toBe("");
        },
        { timeout: 60000, interval: 1000 },
      );
  }, 65000);

  it("redirects browser requests to the realm", async () => {
    const response = await get({});
    expect([302, 303]).toContain(response.status);
    expect(new URL(response.headers.get("location")!).hostname).toBe("sso.uds.dev");
  });
  it("delivers app credentials and removes both UDS headers", async () => {
    await vi.waitFor(
      async () => {
        const response = await get({
          "x-uds-machine-token": "Bearer " + token,
          Authorization: "Basic YXBwOnRlc3Q=",
        });
        if (response.status !== 200)
          throw new Error(`HTTP ${response.status}: ${await response.text()}`);
        const headers = new Headers((await response.json()).headers);
        expect(headers.get("Authorization")).toBe("Basic YXBwOnRlc3Q=");
        expect(headers.has("x-uds-machine-token")).toBe(false);
        expect(headers.has("x-uds-authservice-token")).toBe(false);
      },
      { timeout: 30000, interval: 1000 },
    );
  }, 35000);
  it("requires the configured machine identity even with the correct audience", async () => {
    expect((await get({ "x-uds-machine-token": "Bearer " + otherToken })).status).toBe(403);
  });
  it("rejects empty, duplicate and malformed machine credentials", async () => {
    for (const headers of [
      new Headers({ "x-uds-machine-token": "" }),
      new Headers([
        ["x-uds-machine-token", "Bearer " + token],
        ["x-uds-machine-token", "Bearer " + token],
      ]),
      new Headers({ "x-uds-machine-token": "Bearer invalid" }),
    ])
      expect((await get(headers)).status).toBe(401);
  });
  it("withdraws the route and cleans up policies and waypoint labels on update", async () => {
    kubectl([
      "patch",
      "package",
      ns,
      "-n",
      ns,
      "--type=merge",
      "-p",
      JSON.stringify({ spec: { network: { expose: [] }, sso: [] } }),
    ]);
    kubectl([
      "wait",
      "package/" + ns,
      "-n",
      ns,
      "--for=jsonpath={.status.observedGeneration}=2",
      "--timeout=120s",
    ]);
    const labels = JSON.parse(kubectl(["get", "svc", "httpbin", "-n", ns, "-o", "json"])).metadata
      .labels;
    expect(labels["istio.io/use-waypoint"]).toBeUndefined();
    for (const namespace of [ns, "istio-tenant-gateway"]) {
      expect(
        kubectl([
          "get",
          "authorizationpolicy,requestauthentication",
          "-n",
          namespace,
          "-l",
          "uds.dev/host-auth-package=" + uid,
          "-o",
          "name",
        ]),
      ).toBe("");
    }
    await vi.waitFor(async () => expect((await get({})).status).toBe(404));
  }, 130000);
});
