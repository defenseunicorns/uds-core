/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { getAllLogsByLabelSelector } from "./helpers/pod-logs";
import { execAndWait } from "./helpers/kubectl-exec";
import * as k8s from "@kubernetes/client-node";

describe("Falco e2e Tests", () => {
  let kc: k8s.KubeConfig;
  let exec: k8s.Exec;

  beforeAll(async () => {
    kc = new k8s.KubeConfig();
    kc.loadFromDefault();
    exec = new k8s.Exec(kc);
  });

  afterAll(async () => {});

  /*
   * Test Falco detection of rule Search Private Keys or Passwords: see default rules: https://falco.org/docs/reference/rules/default-rules/
   * This test execs into the falco pod and runs a command that simulates searching for private keys with a unique identifier
   * Then it checks the falcosidekick logs for an alert containing that unique identifier
   * This tests the full e2e pipeline from Falco detection to falcosidekick alerting
   * Note: this requires falcosidekick to be configured in debug mode (or have a registered output) to ensure the alert is logged
   */
  test("Falco detects 'Search Private Keys or Passwords' event and sends to Falco Sidekick", async () => {
    // Generate a random string to identify this test run
    const randomString = Math.random().toString(36).substring(2, 10); // 8-character alphanumeric string

    // Get Falco pod so we can exec into it
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

    // Wait a bit for falco to process the event and send to falcosidekick
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Get all the logs for falcosidekick and search for our unique identifier
    const falcoSidekickLogs = await getAllLogsByLabelSelector(
      "falco",
      "app.kubernetes.io/name=falcosidekick",
    );
    const falcoSidekickEvent = falcoSidekickLogs.find(
      log =>
        log.includes("Grep private keys or passwords activities found") &&
        log.includes(`test-${randomString}`),
    );

    expect(
      falcoSidekickEvent,
      `Expected to find Falco event with identifier "test-${randomString}" in falcosidekick logs. ` +
        `Found ${falcoSidekickLogs.length} total log lines. ` +
        `Logs containing "Grep private keys": ${falcoSidekickLogs.filter(log => log.includes("Grep private keys")).length}`,
    ).toBeDefined();
  });
});
