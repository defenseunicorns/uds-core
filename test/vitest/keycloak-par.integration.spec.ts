/**
 * Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import * as k8s from "@kubernetes/client-node";
import { beforeAll, describe, expect, it } from "vitest";
import { pollUntilSuccess } from "./helpers/polling";

const gateways = [
  ["tenant", "https://sso.uds.dev"],
  ["admin", "https://keycloak.admin.uds.dev"],
] as const;
const statefulSetName = "keycloak";
const namespace = "keycloak";
const parDisabledArgument = "--feature-par=disabled";
const realmDiscoveryPath = (realm: string) => `/realms/${realm}/.well-known/openid-configuration`;

const kubeConfig = new k8s.KubeConfig();
kubeConfig.loadFromDefault();
const apps = kubeConfig.makeApiClient(k8s.AppsV1Api);

async function getStatefulSet(): Promise<k8s.V1StatefulSet> {
  return apps.readNamespacedStatefulSet({
    namespace,
    name: statefulSetName,
  });
}

function findParArgument(args: string[] = []): number {
  const index = args.indexOf(parDisabledArgument);
  expect(index, "PAR feature disablement").toBeGreaterThanOrEqual(0);
  return index;
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

async function patchFeatureArgument(operation: "remove" | "add", index: number) {
  const path = `/spec/template/spec/containers/0/args/${index}`;
  const patch = [
    operation === "remove"
      ? { op: "remove", path }
      : { op: "add", path, value: parDisabledArgument },
  ];
  await apps.patchNamespacedStatefulSet({
    namespace,
    name: statefulSetName,
    body: patch,
  });
}

describe
  .skipIf(process.env.SKIP_INTEGRATION === "true")
  .sequential("integration - Keycloak PAR access", { timeout: 300_000 }, () => {
    beforeAll(async () => {
      const statefulSet = await getStatefulSet();
      findParArgument(statefulSet.spec?.template.spec?.containers[0].args);
    });

    it.each(gateways)("denies PAR variants through the %s gateway", async (_name, origin) => {
      const endpoint = await getParEndpoint(origin, "uds");
      await pollStatus(endpoint, 404);
      const paths = [
        ["bare endpoint", endpoint, 404],
        ["trailing slash", `${endpoint}/`, 404],
        ["query string", `${endpoint}?client_id=par-access-integration-test`, 404],
        ["literal final semicolon", `${endpoint};probe=1`, 400],
        ["encoded final semicolon", `${endpoint}%3Bprobe=1`, 404],
        ["literal non-final semicolon", endpoint.replace("/request", ";probe=1/request"), 400],
        ["encoded non-final semicolon", endpoint.replace("/request", "%3Bprobe=1/request"), 404],
      ] as const;

      for (const [description, path, expectedStatus] of paths) {
        const response = await postPar(path);
        expect(response.status, description).toBe(expectedStatus);
      }
    });

    it("denies PAR for the master realm through the admin gateway", async () => {
      const endpoint = await getParEndpoint(gateways[1][1], "master");
      expect((await postPar(endpoint)).status).toBe(404);
    });

    it("allows PAR responses through both gateways when the feature is enabled, then restores disablement", async () => {
      const statefulSet = await getStatefulSet();
      const index = findParArgument(statefulSet.spec?.template.spec?.containers[0].args);
      try {
        await patchFeatureArgument("remove", index);

        for (const [, origin] of gateways) {
          const endpoint = await getParEndpoint(origin, "uds");
          const response = await pollStatus(endpoint, 401);
          expect(await response.json()).toMatchObject({
            error_description: "Authentication failed.",
          });
        }
      } finally {
        const latestStatefulSet = await getStatefulSet();
        const parDisabled =
          latestStatefulSet.spec?.template.spec?.containers[0].args?.includes(parDisabledArgument);
        if (!parDisabled) {
          await patchFeatureArgument("add", index);
        }
        for (const [, origin] of gateways) {
          const endpoint = await getParEndpoint(origin, "uds");
          await pollStatus(endpoint, 404);
        }
      }
    });
  });
