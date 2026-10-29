/**
 * Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import * as k8s from "@kubernetes/client-node";
import { beforeAll, describe, expect, it } from "vitest";
import { pollUntilSuccess } from "../vitest/helpers/polling";

const gateways = [
  ["tenant", "https://sso.uds.dev"],
  ["admin", "https://keycloak.admin.uds.dev"],
] as const;
const keycloakApi = "security.istio.io";
const policyName = "keycloak-block-admin-access-from-public-gateway";
const namespace = "keycloak";
const parRulePath = "/realms/{*}/protocol/openid-connect/ext/par/{**}";
const realmDiscoveryPath = (realm: string) => `/realms/${realm}/.well-known/openid-configuration`;

const kubeConfig = new k8s.KubeConfig();
kubeConfig.loadFromDefault();
const customObjects = kubeConfig.makeApiClient(k8s.CustomObjectsApi);

type PolicyRule = {
  to?: { operation?: { paths?: string[] } }[];
};

type AuthorizationPolicy = {
  spec?: { action?: string; rules?: PolicyRule[] };
};

async function getPolicy(): Promise<AuthorizationPolicy> {
  return (await customObjects.getNamespacedCustomObject({
    group: keycloakApi,
    version: "v1",
    namespace,
    plural: "authorizationpolicies",
    name: policyName,
  })) as AuthorizationPolicy;
}

function findParRule(rules: PolicyRule[] = []): { index: number; rule: PolicyRule } {
  const index = rules.findIndex(rule =>
    rule.to?.some(to => to.operation?.paths?.includes(parRulePath)),
  );
  expect(index, "PAR deny rule").toBeGreaterThanOrEqual(0);
  return { index, rule: rules[index] };
}

async function getParEndpoint(origin: string, realm: string): Promise<string> {
  const response = await fetch(`${origin}${realmDiscoveryPath(realm)}`, {
    signal: AbortSignal.timeout(10_000),
  });
  expect(response.status).toBe(200);
  const discovery = (await response.json()) as { pushed_authorization_request_endpoint?: string };
  expect(discovery.pushed_authorization_request_endpoint).toBeDefined();
  const endpoint = discovery.pushed_authorization_request_endpoint!;
  expect(new URL(endpoint).origin).toBe(origin);
  return endpoint;
}

async function postPar(endpoint: string): Promise<Response> {
  return fetch(endpoint, {
    method: "POST",
    redirect: "manual",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "client_id=par-access-integration-test",
    signal: AbortSignal.timeout(10_000),
  });
}

async function pollStatus(endpoint: string, status: number): Promise<Response> {
  return pollUntilSuccess(
    () => postPar(endpoint),
    response => response.status === status,
    `PAR response ${status} from ${new URL(endpoint).host}`,
    120_000,
    5_000,
  );
}

async function patchRule(operation: "remove" | "add", index: number, rule?: PolicyRule) {
  const patch = [
    operation === "remove"
      ? { op: "remove", path: `/spec/rules/${index}` }
      : { op: "add", path: `/spec/rules/${index}`, value: rule },
  ];
  await customObjects.patchNamespacedCustomObject({
    group: keycloakApi,
    version: "v1",
    namespace,
    plural: "authorizationpolicies",
    name: policyName,
    body: patch,
  });
}

describe
  .skipIf(process.env.SKIP_INTEGRATION === "true")
  .sequential("integration - Keycloak PAR access", () => {
    beforeAll(async () => {
      const policy = await getPolicy();
      expect(policy.spec?.action).toBe("DENY");
      findParRule(policy.spec?.rules);
    });

    it.each(gateways)("denies PAR variants through the %s gateway", async (_name, origin) => {
      const endpoint = await getParEndpoint(origin, "uds");
      await pollStatus(endpoint, 403);
      const paths = [
        ["bare endpoint", endpoint, 403],
        ["trailing slash", `${endpoint}/`, 403],
        ["query string", `${endpoint}?client_id=par-access-integration-test`, 403],
        ["literal final semicolon", `${endpoint};probe=1`, 403],
        ["encoded final semicolon", `${endpoint}%3Bprobe=1`, 403],
        ["literal non-final semicolon", endpoint.replace("/request", ";probe=1/request"), 400],
        ["encoded non-final semicolon", endpoint.replace("/request", "%3Bprobe=1/request"), 404],
      ] as const;

      for (const [description, path, expectedStatus] of paths) {
        const response = await postPar(path);
        expect(response.status, description).toBe(expectedStatus);
        if (expectedStatus === 403) {
          expect(await response.text(), description).toContain("RBAC: access denied");
        }
      }
    });

    it("denies PAR for the master realm through the admin gateway", async () => {
      const endpoint = await getParEndpoint(gateways[1][1], "master");
      expect((await postPar(endpoint)).status).toBe(403);
    });

    it("allows PAR responses through both gateways when the rule is removed, then restores denial", async () => {
      const policy = await getPolicy();
      const { index, rule } = findParRule(policy.spec?.rules);
      try {
        await patchRule("remove", index);

        for (const [, origin] of gateways) {
          const endpoint = await getParEndpoint(origin, "uds");
          const response = await pollStatus(endpoint, 401);
          expect(await response.json()).toMatchObject({
            error_description: "Authentication failed.",
          });
        }
      } finally {
        const latestPolicy = await getPolicy();
        const parRuleExists = latestPolicy.spec?.rules?.some(rule =>
          rule.to?.some(to => to.operation?.paths?.includes(parRulePath)),
        );
        if (!parRuleExists) {
          await patchRule("add", index, rule);
        }
        for (const [, origin] of gateways) {
          const endpoint = await getParEndpoint(origin, "uds");
          await pollStatus(endpoint, 403);
        }
      }
    });
  });
