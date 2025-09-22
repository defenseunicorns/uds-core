/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import * as net from "net";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { closeForward, getForward } from "./helpers/forward";
import { execAndWait } from "./helpers/kubectl-exec";
import { pollUntilSuccess } from "./helpers/polling";
import { queryLoki } from "./helpers/loki";
import * as k8s from "@kubernetes/client-node";

describe("Falco Integration e2e Tests", () => {
  let kc: k8s.KubeConfig;
  let exec: k8s.Exec;
  let lokiRead: { server: net.Server; url: string };

  beforeAll(async () => {
    kc = new k8s.KubeConfig();
    kc.loadFromDefault();
    exec = new k8s.Exec(kc);
    lokiRead = await getForward("loki-read", "loki", 3100);
  });

  afterAll(async () => {
    await closeForward(lokiRead.server);
  });

  /*
   * Test Falco detection of rule Search Private Keys or Passwords: see default rules: https://falco.org/docs/reference/rules/default-rules/
   * This test execs into the nginx pod in the uds-dev-stack namespace and runs a command that simulates searching for private keys with a unique identifier
   * Then it checks that this event appears in Loki
   */
  test("Falco detects 'Search Private Keys or Passwords' event and logs appear in Loki", async () => {
    const randomString = Math.random().toString(36).substring(2, 10);

    const core = kc.makeApiClient(k8s.CoreV1Api);
    const podsResponse = await core.listNamespacedPod({
      namespace: "uds-dev-stack",
      labelSelector: "name=nginx",
    });

    const nginxPod = podsResponse.items[0];
    if (!nginxPod?.metadata?.name) {
      throw new Error("No nginx pod found");
    }

    await execAndWait(
      exec,
      "uds-dev-stack",
      nginxPod.metadata!.name!,
      ["find", `/tmp/test-${randomString}`, "-name", "id_rsa"],
      "nginx",
    );

    const falcoEvent = await pollUntilSuccess(
      async () => {
        const queryResult = await queryLoki(
          lokiRead,
          `{rule="Search Private Keys or Passwords"} |= "test-${randomString}"`,
        );

        return queryResult.status === "success" && queryResult.data.result.length > 0
          ? queryResult
          : null;
      },
      result => result !== null,
      `Falco event with identifier "test-${randomString}" in Loki logs`,
      60000, // 60 seconds timeout
      5000, // 5 seconds interval
    );

    expect(falcoEvent).toBeDefined();
    expect(falcoEvent!.status).toBe("success");
    expect(falcoEvent!.data.result.length).toBeGreaterThan(0);
  }, 70000); // Set test timeout to 70 seconds
});
