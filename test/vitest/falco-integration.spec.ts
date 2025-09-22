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

  test("Falco detects 'Search Private Keys or Passwords' event and logs appear in Loki", async () => {
    const randomString = Math.random().toString(36).substring(2, 10);

    const core = kc.makeApiClient(k8s.CoreV1Api);
    const podsResponse = await core.listNamespacedPod({
      namespace: "falco",
      labelSelector: "app.kubernetes.io/name=falco",
    });

    const falcoPod = podsResponse.items[0];
    if (!falcoPod!.metadata!.name) {
      throw new Error("No falco pod found");
    }

    await execAndWait(
      exec,
      "falco",
      falcoPod.metadata!.name!,
      ["find", `/tmp/test-${randomString}`, "-name", "id_rsa"],
      "falco",
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
