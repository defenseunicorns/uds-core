/**
 * Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { constants as http2 } from "node:http2";
import { loadAllYaml } from "@kubernetes/client-node";
import { vi } from "vitest";

/** Runs kubectl with optional stdin and returns stdout. Command failures reject the promise. */
export const kubectl = (args: string[], input?: string): Promise<string> =>
  new Promise((resolve, reject) => {
    // Keep sockets responsive while Kubernetes waits for reconciliation or deletion.
    const child = execFile(
      "kubectl",
      args,
      { encoding: "utf8", timeout: 300000 },
      (error, stdout) => (error ? reject(error) : resolve(stdout)),
    );
    child.stdin?.on("error", reject);
    child.stdin?.end(input);
  });

/** Sends a host request and retries once only when HTTP/2 refused the stream before processing. */
export async function hostRequest(url: string, init: RequestInit = {}): Promise<Response> {
  const send = () => fetch(url, { ...init, signal: init.signal ?? AbortSignal.timeout(10000) });
  try {
    return await send();
  } catch (error) {
    const cause = error instanceof Error ? error.cause : undefined;
    if (
      !(cause instanceof Error) ||
      !("code" in cause) ||
      cause.code !== "ERR_HTTP2_STREAM_ERROR" ||
      !("http2ErrorCode" in cause) ||
      cause.http2ErrorCode !== http2.NGHTTP2_REFUSED_STREAM
    )
      throw error;
    // A refused stream has not reached application processing (RFC 9113, section 8.7).
    return send();
  }
}

type PolicyRule = {
  when?: { key: string; values?: string[]; notValues?: string[] }[];
  to?: unknown[];
};
type PolicyTarget = {
  targetRefs?: { group: string; kind: string; name: string }[];
  selector?: { matchLabels: Record<string, string> };
};

type HostAuthenticationFixture = ReturnType<typeof hostAuthenticationFixture>;

/** Confirms access, installs a temporary DENY policy, checks denial, removes it, and checks recovery. */
export async function verifyAdditionalDenial(
  fixture: HostAuthenticationFixture,
  token: string,
  namespace: string,
  target: PolicyTarget,
  rules: PolicyRule[],
) {
  const { ns, waitForStatus } = fixture;
  const name = ns + "-identity-check";
  await waitForStatus(token, 200);
  await kubectl(
    ["create", "-f", "-"],
    JSON.stringify({
      apiVersion: "security.istio.io/v1",
      kind: "AuthorizationPolicy",
      metadata: { name, namespace },
      spec: { ...target, action: "DENY", rules },
    }),
  );
  try {
    await waitForStatus(token, 403);
  } finally {
    await kubectl(["delete", "authorizationpolicy", name, "-n", namespace]);
  }
  await waitForStatus(token, 200);
}

/** Temporarily routes an alternate host to `httpbin`, then removes its Service and VirtualService. */
export async function withServiceAlias(
  fixture: HostAuthenticationFixture,
  check: (origin: string) => Promise<void>,
): Promise<void> {
  const { ns } = fixture;
  const service = JSON.parse(await kubectl(["get", "service", "httpbin", "-n", ns, "-o", "json"]));
  const alias = "security-test-alias";
  const aliasOrigin = `https://${ns}-alias.uds.dev`;
  await kubectl(
    ["create", "-f", "-"],
    JSON.stringify({
      apiVersion: "v1",
      kind: "Service",
      metadata: {
        name: alias,
        namespace: ns,
        labels: {
          "istio.io/use-waypoint": service.metadata.labels["istio.io/use-waypoint"],
          "istio.io/ingress-use-waypoint": "true",
        },
      },
      spec: { selector: service.spec.selector, ports: service.spec.ports },
    }),
  );
  try {
    await kubectl(
      ["create", "-f", "-"],
      JSON.stringify({
        apiVersion: "networking.istio.io/v1",
        kind: "VirtualService",
        metadata: { name: alias, namespace: ns },
        spec: {
          hosts: [new URL(aliasOrigin).hostname],
          gateways: ["istio-tenant-gateway/tenant-gateway"],
          http: [
            {
              route: [
                {
                  destination: {
                    host: `${alias}.${ns}.svc.cluster.local`,
                    port: { number: 8000 },
                  },
                },
              ],
            },
          ],
        },
      }),
    );
    await check(aliasOrigin);
  } finally {
    await kubectl(["delete", "virtualservice", alias, "-n", ns, "--ignore-not-found"]);
    await kubectl(["delete", "service", alias, "-n", ns, "--ignore-not-found"]);
  }
}

/**
 * Changes mesh mode with an unsupported Keycloak mapper and waits for the Package to enter Retrying.
 * @returns The original Package spec for restoring the fixture.
 */
export async function rejectMeshModeUpdate(fixture: HostAuthenticationFixture, mode: string) {
  const { ns } = fixture;
  const spec = await fixture.readSpec();
  const originalSpec = structuredClone(spec);
  spec.network.serviceMesh.mode = mode === "ambient" ? "sidecar" : "ambient";
  spec.sso.push({
    name: "Security failure test",
    clientId: ns + "-rejected",
    standardFlowEnabled: false,
    protocolMappers: [
      {
        name: "Rejected mapper",
        protocol: "openid-connect",
        protocolMapper: "uds-security-test-unsupported",
      },
    ],
  });
  await fixture.patchSpec(spec);
  await kubectl([
    "wait",
    "package/" + ns,
    "-n",
    ns,
    "--for=jsonpath={.status.phase}=Retrying",
    "--timeout=30s",
  ]);
  return originalSpec;
}

/** Removes machine access from every SSO client, waits for reconciliation, and returns the original spec. */
export async function revokeMachineAccess(fixture: HostAuthenticationFixture) {
  const originalSpec = await fixture.readSpec();
  const clients = structuredClone(originalSpec.sso);
  for (const client of clients) delete client.machineAccess;
  await fixture.patchSpec({ sso: clients });
  await fixture.waitForReconciliation();
  return originalSpec;
}

/**
 * Creates a protected host fixture. Call `deploy` during setup and `cleanup` during teardown.
 * Access tests use two hosts. On the first, `machine` and `secondMachine` have access.
 * `otherMachine` gets the same token audience without a grant. Lifecycle tests use one host and one machine.
 *
 * @param mode - The mesh mode under test, either ambient or sidecar.
 * @param suite - Distinguishes hostnames for fixtures running in the same mesh mode.
 */
export function hostAuthenticationFixture(mode: string, suite: string) {
  const host = `host-auth-${mode}-${suite}`;
  const ns = `${host}-${randomUUID().slice(0, 8)}`;
  const origin = `https://${host}.uds.dev`;
  const machine = `${ns}-machine`;
  const browser = `${ns}-browser`;
  const otherMachine = ns + "-other";
  const secondMachine = ns + "-second";
  const secondHost = host + "-b";
  const secondBrowser = ns + "-b-browser";
  const hostBMachine = ns + "-b-machine";
  const metricsPath = "/base64/" + Buffer.from("host_auth_scrape 1\n").toString("base64");
  let created = false;
  const get = (headers: HeadersInit) =>
    hostRequest(origin + "/headers", { headers, redirect: "manual" });

  async function deploy(): Promise<void> {
    await kubectl(["create", "namespace", ns]);
    created = true;
    // Zarf provisions this pull secret for packaged namespaces. The fixture creates its own.
    const { data, type } = JSON.parse(
      await kubectl(["get", "secret", "private-registry", "-n", "zarf", "-o", "json"]),
    );
    await kubectl(
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
      resolve(__dirname, "../../../src/test/app-ambient-authservice-tenant.yaml"),
      "utf8",
    ).replaceAll("authservice-ambient-test-app", ns);
    const lifecycle = suite === "lifecycle";
    const targets = [
      {
        host,
        service: "httpbin",
        browser,
        machines: lifecycle ? [machine] : [machine, secondMachine, otherMachine],
      },
    ];
    if (!lifecycle) {
      targets.push({
        host: secondHost,
        service: "httpbin2",
        browser: secondBrowser,
        machines: [hostBMachine],
      });
    }

    const manifests = loadAllYaml(fixture).filter(doc =>
      targets.some(target => target.service === doc.metadata?.name),
    );
    for (const doc of manifests) {
      if (!lifecycle && doc.kind === "Service") doc.spec.selector.version = "v1";
      if (doc.kind === "Deployment") doc.spec.template.spec.containers[0].ports[0].name = "http";
    }
    const applyManifests = (items: typeof manifests) =>
      kubectl(["apply", "-f", "-"], JSON.stringify({ apiVersion: "v1", kind: "List", items }));
    await applyManifests(manifests.filter(doc => doc.kind !== "Deployment"));
    await kubectl(
      ["apply", "-f", "-"],
      JSON.stringify({
        apiVersion: "uds.dev/v1alpha1",
        kind: "Package",
        metadata: { name: ns, namespace: ns },
        spec: {
          ...(!lifecycle && {
            monitor: targets.map(({ service }, index) => ({
              kind: index === 0 ? "ServiceMonitor" : "PodMonitor",
              selector: { app: service },
              portName: "http",
              targetPort: 80,
              path: metricsPath,
              description: "host-metrics-" + service,
            })),
          }),
          network: {
            serviceMesh: { mode },
            expose: targets.map(({ host, service }) => ({
              host,
              service,
              port: 8000,
              targetPort: 80,
              selector: { app: service },
            })),
          },
          sso: targets.flatMap(({ host, browser, machines }) => [
            {
              name: browser,
              clientId: browser,
              authservice: { exposeHost: host },
              redirectUris: [`https://${host}.uds.dev/authservice/callback`],
            },
            ...machines.map(clientId => ({
              name: clientId,
              clientId,
              standardFlowEnabled: false,
              serviceAccountsEnabled: true,
              ...(clientId !== otherMachine && { machineAccess: { authserviceClientId: browser } }),
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
          ]),
        },
      }),
    );
    await kubectl([
      "wait",
      "-n",
      ns,
      "package/" + ns,
      "--for=jsonpath={.status.phase}=Ready",
      "--timeout=240s",
    ]);
    await applyManifests(manifests.filter(doc => doc.kind === "Deployment"));
    for (const { service } of targets)
      await kubectl(["rollout", "status", "deployment/" + service, "-n", ns, "--timeout=180s"]);
    await waitForStatus(await accessToken(machine), 200, 120000);
    await waitForBrowserLogin();
  }

  async function waitForReconciliation(): Promise<void> {
    const generation = await kubectl([
      "get",
      "package",
      ns,
      "-n",
      ns,
      "-o",
      "jsonpath={.metadata.generation}",
    ]);
    await kubectl([
      "wait",
      "package/" + ns,
      "-n",
      ns,
      "--for=jsonpath={.status.observedGeneration}=" + generation,
      "--timeout=120s",
    ]);
  }

  /** Reads the client's generated secret and requests a client-credentials token. */
  async function accessToken(clientId: string): Promise<string> {
    const secret = Buffer.from(
      await kubectl(["-n", ns, "get", "secret", clientId, "-o", "jsonpath={.data.client_secret}"]),
      "base64",
    ).toString();
    const response = await hostRequest(
      "https://sso.uds.dev/realms/uds/protocol/openid-connect/token",
      {
        method: "POST",
        body: new URLSearchParams({
          grant_type: "client_credentials",
          client_id: clientId,
          client_secret: secret,
        }),
      },
    );
    if (!response.ok)
      throw new Error(`Token request failed for ${clientId}: HTTP ${response.status}`);
    return (await response.json()).access_token as string;
  }

  /** Deletes the deployed Package and namespace, then waits for its generated gateway policies to vanish. */
  async function cleanup(): Promise<void> {
    if (!created) return;
    await kubectl([
      "delete",
      "package",
      ns,
      "-n",
      ns,
      "--ignore-not-found",
      "--wait=true",
      "--timeout=180s",
    ]);
    await kubectl(["delete", "namespace", ns, "--wait=true", "--timeout=60s"]);
    await vi.waitFor(
      async () => {
        if (await resources("istio-tenant-gateway"))
          throw new Error("Host policies remain after fixture cleanup");
      },
      { timeout: 60000, interval: 1000 },
    );
  }

  /** Reads host-auth resources belonging to this deployed Package. */
  function getHostResources(namespace: string, kinds: string, output: string) {
    return kubectl([
      "get",
      kinds,
      "-n",
      namespace,
      "-l",
      "uds/package=" + ns + ",uds/for=host-auth",
      "-o",
      output,
    ]);
  }

  async function readPolicies(
    namespace: string,
  ): Promise<{ spec: PolicyTarget & { rules: PolicyRule[]; action: string } }[]> {
    return JSON.parse(await getHostResources(namespace, "authorizationpolicy", "json")).items;
  }

  function resources(namespace: string) {
    return getHostResources(
      namespace,
      "authorizationpolicy,requestauthentication,trafficextension",
      "name",
    );
  }

  async function readSpec() {
    return JSON.parse(await kubectl(["get", "package", ns, "-n", ns, "-o", "json"])).spec;
  }

  async function patchSpec(spec: unknown): Promise<void> {
    await kubectl([
      "patch",
      "package",
      ns,
      "-n",
      ns,
      "--type=merge",
      "-p",
      JSON.stringify({ spec }),
    ]);
  }

  async function waitForStatus(token: string, status: number, timeout = 30000): Promise<void> {
    await vi.waitFor(
      async () => {
        const headers: HeadersInit = token ? { "x-uds-machine-token": "Bearer " + token } : {};
        const response = await get(headers);
        if (response.status !== status)
          throw new Error(`Expected HTTP ${status}, got ${response.status}`);
      },
      { timeout, interval: 500 },
    );
  }

  async function waitForBrowserLogin(): Promise<void> {
    await vi.waitFor(
      async () => {
        const response = await get({});
        const location = response.headers.get("location");
        const login = location ? new URL(location) : undefined;
        if (
          ![302, 303].includes(response.status) ||
          login?.hostname !== "sso.uds.dev" ||
          login.searchParams.get("client_id") !== browser ||
          login.searchParams.get("redirect_uri") !== origin + "/authservice/callback"
        )
          throw new Error(
            `Expected login for ${browser}, got HTTP ${response.status} for ${login?.searchParams.get("client_id")}`,
          );
      },
      { timeout: 30000, interval: 500 },
    );
  }

  return {
    ns,
    origin,
    machine,
    browser,
    otherMachine,
    secondMachine,
    secondHost,
    secondBrowser,
    hostBMachine,
    metricsPath,
    get,
    deploy,
    accessToken,
    cleanup,
    readPolicies,
    resources,
    readSpec,
    patchSpec,
    waitForReconciliation,
    waitForStatus,
    waitForBrowserLogin,
  };
}
