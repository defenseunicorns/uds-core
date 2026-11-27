/**
 * Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import {
  hostAuthenticationFixture,
  hostRequest,
  kubectl,
  rejectMeshModeUpdate,
  revokeMachineAccess,
  verifyAdditionalDenial,
  withServiceAlias,
} from "./helpers/host-authentication";
import { closeForward, getForward } from "./helpers/forward";
import { fetchWithTimeout } from "./helpers/fetch";

for (const mode of ["ambient", "sidecar"]) {
  describe(`protected hosts require the right browser or machine access (${mode})`, () => {
    const fixture = hostAuthenticationFixture(mode, "access");
    const {
      ns,
      origin,
      machine,
      browser,
      otherMachine,
      secondMachine,
      secondHost,
      hostBMachine,
      get,
      accessToken,
      readPolicies,
      secondBrowser,
      metricsPath,
    } = fixture;
    let token: string;
    let otherToken: string;
    let secondToken: string;
    let hostBToken: string;

    beforeAll(async () => {
      await fixture.deploy();
      [token, otherToken, secondToken, hostBToken] = await Promise.all(
        [machine, otherMachine, secondMachine, hostBMachine].map(accessToken),
      );
    }, 480000);
    afterAll(() => fixture.cleanup(), 245000);

    describe.concurrent("browser requests require login", () => {
      test.each(["/", "/headers", "/users/auth/saml/callback", "/stats/prometheus"])(
        "requires browser authentication on %s",
        async path => {
          const response = await hostRequest(origin + path, { redirect: "manual" });
          expect([302, 303]).toContain(response.status);
          expect(new URL(response.headers.get("location")!).hostname).toBe("sso.uds.dev");
        },
      );
      test("still redirects to sign-in when only the application Authorization header is supplied", async () => {
        expect([302, 303]).toContain((await get({ Authorization: "Bearer " + token })).status);
      });
    });

    describe.concurrent("approved machines can access protected hosts", () => {
      test("preserves application Authorization and strips UDS credentials", async () => {
        const response = await get({
          "x-uds-machine-token": "Bearer " + token,
          Authorization: "Basic YXBwOnRlc3Q=",
        });
        expect(response.status).toBe(200);
        const headers = new Headers((await response.json()).headers);
        expect(headers.get("Authorization")).toBe("Basic YXBwOnRlc3Q=");
        for (const name of ["x-uds-machine-token", "x-uds-authservice-token"])
          expect(headers.has(name)).toBe(false);
      });
      test("accepts a second approved machine client on the same host", async () => {
        expect((await get({ "x-uds-machine-token": "Bearer " + secondToken })).status).toBe(200);
      });
    });

    describe.concurrent("invalid machine credentials are rejected", () => {
      test.each([
        { name: "empty machine token", headers: () => new Headers({ "x-uds-machine-token": "" }) },
        {
          name: "duplicate machine tokens",
          headers: () =>
            new Headers([
              ["x-uds-machine-token", "Bearer " + token],
              ["x-uds-machine-token", "Bearer " + token],
            ]),
        },
        {
          name: "malformed machine token",
          headers: () => new Headers({ "x-uds-machine-token": "Bearer invalid" }),
        },
        {
          name: "client-supplied browser token",
          headers: () => new Headers({ "x-uds-authservice-token": "Bearer " + token }),
        },
        {
          name: "modified machine signature",
          headers: () => {
            const [header, payload, signature] = token.split(".");
            const invalidSignature = (signature[0] === "A" ? "B" : "A") + signature.slice(1);
            return new Headers({
              "x-uds-machine-token": `Bearer ${header}.${payload}.${invalidSignature}`,
            });
          },
        },
      ])("rejects $name", async ({ headers }) => {
        expect((await get(headers())).status).toBe(401);
      });
    });

    describe.concurrent("machine credentials apply only to their host and identity", () => {
      test.each(["A to B", "B to A"])("rejects another host's token: %s", async direction => {
        const toB = direction === "A to B";
        const request = (credential: string) =>
          hostRequest(toB ? `https://${secondHost}.uds.dev/headers` : origin + "/headers", {
            headers: { "x-uds-machine-token": "Bearer " + credential },
            redirect: "manual",
          });
        expect((await request(toB ? hostBToken : token)).status).toBe(200);
        expect((await request(toB ? token : hostBToken)).status).toBe(403);
      });
      test("requires the configured machine identity even with the correct audience", async () => {
        expect((await get({ "x-uds-machine-token": "Bearer " + otherToken })).status).toBe(403);
      });
      test("keeps UDS machine credentials off unrelated tenant routes", async () => {
        const url = "https://sso.uds.dev/realms/uds/.well-known/openid-configuration";
        expect((await hostRequest(url)).status).toBe(200);
        expect(
          (await hostRequest(url, { headers: { "x-uds-machine-token": "Bearer " + token } }))
            .status,
        ).toBe(403);
      });
    });

    describe.concurrent("changes to protected hosts and Services", () => {
      test("rejects a host login callback that overlaps the application’s SAML callback", async () => {
        const callback = origin + "/users/auth/saml/callback";
        const { sso: clients } = await fixture.readSpec();
        clients.find((s: { clientId: string }) => s.clientId === browser).redirectUris = [callback];
        clients.push({
          name: "GitLab SAML",
          clientId: ns + "-saml",
          protocol: "saml",
          redirectUris: [callback],
        });
        await expect(
          kubectl([
            "patch",
            "package",
            ns,
            "-n",
            ns,
            "--dry-run=server",
            "--type=merge",
            "-p",
            JSON.stringify({ spec: { sso: clients } }),
          ]),
        ).rejects.toThrow(/overlaps another SSO client's application route/);
      });
      test("rejects deleting a published protected Service", async () => {
        await expect(
          kubectl(["delete", "service", "httpbin", "-n", ns, "--dry-run=server"]),
        ).rejects.toThrow(/Withdraw the protected Package exposure/);
      });
      test("rejects changing a published protected Service selector", async () => {
        await expect(
          kubectl([
            "patch",
            "service",
            "httpbin",
            "-n",
            ns,
            "--type=merge",
            "--dry-run=server",
            "-p",
            JSON.stringify({ spec: { selector: { version: "different" } } }),
          ]),
        ).rejects.toThrow(/Withdraw the protected Package exposure/);
      });
    });
    // These policies deliberately deny this fixture's traffic, so the cases run sequentially.
    test.each(["ingress", "workload"])(
      "denies a valid token with the wrong identity at the %s proxy",
      async proxy => {
        const [freshToken, freshSecondToken] = await Promise.all(
          [machine, secondMachine].map(accessToken),
        );
        const namespace = proxy === "ingress" ? "istio-tenant-gateway" : ns;
        // Both are genuine, independently issued tokens. Only the expected subject changes in the extra test policy.
        const expectedSubject = JSON.parse(
          Buffer.from(freshSecondToken.split(".")[1], "base64url").toString(),
        ).sub;
        const policy = (await readPolicies(namespace)).find(
          p =>
            p.spec.action === "DENY" &&
            p.spec.rules.some(r =>
              r.when?.some(c => c.key === "request.auth.presenter" && c.values?.includes(machine)),
            ),
        );
        if (!policy) throw new Error("Missing machine identity policy in " + namespace);
        const pair = policy.spec.rules.find(r =>
          r.when?.some(c => c.key === "request.auth.presenter" && c.values?.includes(machine)),
        )!;
        const subject = pair.when!.find(c => c.key === "request.auth.claims[sub]");
        if (!subject?.notValues?.length || subject.notValues.includes(expectedSubject))
          throw new Error("Fixture requires two distinct service-account subjects");
        subject.notValues = [expectedSubject];
        await verifyAdditionalDenial(
          fixture,
          freshToken,
          namespace,
          { targetRefs: policy.spec.targetRefs, selector: policy.spec.selector },
          [pair],
        );
      },
      90000,
    );

    test.runIf(mode === "ambient")(
      "denies a machine at the waypoint when the policy allows only another host's clients",
      async () => {
        const policies = await readPolicies(ns);
        const policyB = policies.find(
          p =>
            p.spec.action === "DENY" &&
            p.spec.targetRefs?.[0]?.name === secondBrowser + "-waypoint",
        );
        if (!policyB) throw new Error("Missing host B waypoint policy");
        // Add B's identity restrictions to A's test Service. A's regular ingress still authenticates A.
        const rules = policyB.spec.rules
          .filter(rule =>
            rule.when?.some(
              condition =>
                condition.key === "experimental.envoy.filters.http.lua[uds_authservice_channel]" &&
                condition.values?.includes("machine"),
            ),
          )
          .map(rule => ({ when: rule.when }));
        expect(rules.length).toBeGreaterThan(0);
        await verifyAdditionalDenial(
          fixture,
          await accessToken(machine),
          ns,
          {
            targetRefs: [
              { group: "gateway.networking.k8s.io", kind: "Gateway", name: browser + "-waypoint" },
            ],
          },
          rules,
        );
      },
      90000,
    );

    test.runIf(mode === "ambient")(
      "requires authentication on an unexposed service alias",
      async () => {
        await withServiceAlias(fixture, async aliasOrigin => {
          await vi.waitFor(
            async () => {
              expect(
                (await hostRequest(aliasOrigin + "/headers", { redirect: "manual" })).status,
              ).toBe(403);
            },
            { timeout: 45000, interval: 500 },
          );
        });
        expect(
          (await get({ "x-uds-machine-token": "Bearer " + (await accessToken(machine)) })).status,
        ).toBe(200);
      },
      90000,
    );
    // Let Prometheus discover the access fixture while the lifecycle cases run.
    registerLifecycleTests(mode);
    test("keeps proxy and application scrapes healthy while ingress requires authentication", async () => {
      const proxy = await getForward("kube-prometheus-stack-prometheus", "monitoring", 9090);
      try {
        await vi.waitFor(
          async () => {
            const response = await fetchWithTimeout(`${proxy.url}/api/v1/targets?state=active`);
            expect(response.status).toBe(200);
            const activeTargets = (await response.json()).data.activeTargets as {
              labels: { namespace?: string };
              scrapePool: string;
              health: string;
              lastError: string;
            }[];
            const proxyTargets = activeTargets.filter(
              target =>
                target.labels.namespace === ns &&
                target.scrapePool === "podMonitor/istio-system/envoy-stats-monitor/0",
            );
            expect(proxyTargets.length).toBeGreaterThan(0);
            for (const kind of ["serviceMonitor", "podMonitor"]) {
              const targets = activeTargets.filter(target =>
                target.scrapePool.startsWith(`${kind}/${ns}/`),
              );
              expect(targets, kind).toHaveLength(1);
              expect(targets[0].health, `${kind}: ${targets[0].lastError}`).toBe("up");
            }
            for (const target of proxyTargets) expect(target.health, target.lastError).toBe("up");
          },
          { timeout: 60000, interval: 1000 },
        );
        const unauthenticated = await hostRequest(origin + metricsPath, { redirect: "manual" });
        expect([302, 303]).toContain(unauthenticated.status);
        const authenticated = await hostRequest(origin + metricsPath, {
          headers: { "x-uds-machine-token": "Bearer " + (await accessToken(machine)) },
          redirect: "manual",
        });
        expect(authenticated.status).toBe(200);
        expect(await authenticated.text()).toBe("host_auth_scrape 1\n");
      } finally {
        await closeForward(proxy.server);
      }
    }, 90000);
  });
}

function registerLifecycleTests(mode: string) {
  describe(`protected host access follows package changes (${mode})`, () => {
    let fixture: ReturnType<typeof hostAuthenticationFixture>;
    let token: string;

    // Every destructive scenario starts with a new Package, clients, and namespace.
    beforeEach(async () => {
      fixture = hostAuthenticationFixture(mode, "lifecycle");
      await fixture.deploy();
      token = await fixture.accessToken(fixture.machine);
    }, 480000);
    afterEach(() => fixture.cleanup(), 245000);

    test("keeps protection through a rejected mesh-mode update and restores machine access", async () => {
      const { ns, readPolicies } = fixture;
      const denials = async () =>
        (await readPolicies(ns))
          .filter(policy => policy.spec.action === "DENY")
          .map(policy => policy.spec);
      const originalDenials = await denials();
      expect(originalDenials.length).toBeGreaterThan(0);
      const originalSpec = await rejectMeshModeUpdate(fixture, mode);
      const labels = JSON.parse(await kubectl(["get", "namespace", ns, "-o", "json"])).metadata
        .labels;
      expect(labels[mode === "ambient" ? "istio.io/dataplane-mode" : "istio-injection"]).toBe(
        mode === "ambient" ? "ambient" : "enabled",
      );
      expect(await denials()).toEqual(originalDenials);
      await fixture.waitForBrowserLogin();

      await fixture.patchSpec(originalSpec);
      await fixture.waitForReconciliation();
      await fixture.waitForStatus(token, 200);
      await fixture.waitForBrowserLogin();
    }, 180000);

    test("revokes and re-enables machine access while browser login remains required", async () => {
      const { waitForStatus } = fixture;
      const originalSpec = await revokeMachineAccess(fixture);
      await waitForStatus(token, 403);
      await fixture.waitForBrowserLogin();
      await fixture.patchSpec(originalSpec);
      await fixture.waitForReconciliation();
      await fixture.waitForStatus(token, 200);
      await fixture.waitForBrowserLogin();
    }, 300000);

    test("removes host protection after its exposure is withdrawn", async () => {
      const { ns, resources, patchSpec, waitForReconciliation, waitForStatus } = fixture;
      await patchSpec({ network: { expose: [] }, sso: [] });
      await waitForReconciliation();
      const labels = JSON.parse(
        await kubectl(["get", "service", "httpbin", "-n", ns, "-o", "json"]),
      ).metadata.labels;
      expect(labels["istio.io/use-waypoint"]).toBeUndefined();
      for (const namespace of [ns, "istio-tenant-gateway"])
        expect(await resources(namespace)).toBe("");
      await waitForStatus("", 404);
    }, 600000);

    test("removes protection before deleting services from a protected package", async () => {
      const { ns, readPolicies, resources, waitForStatus } = fixture;
      expect((await readPolicies("istio-tenant-gateway")).length).toBeGreaterThan(0);
      await fixture.waitForBrowserLogin();
      await kubectl(["delete", "package", ns, "-n", ns, "--wait=true", "--timeout=180s"]);
      expect(await resources("istio-tenant-gateway")).toBe("");
      await waitForStatus("", 404);
      await kubectl(["delete", "service", "httpbin", "-n", ns, "--wait=true", "--timeout=30s"]);
    }, 600000);
  });
}
