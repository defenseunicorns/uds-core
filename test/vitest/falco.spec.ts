/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { execAndWait, getAllLogsByLabelSelector, withTempPod } from "./helpers/k8s";
import { pollUntilSuccess } from "./helpers/polling";

describe("Falco e2e Tests", () => {
  beforeAll(async () => {});

  afterAll(async () => {});

  /*
   * Test Falco detection of rule Search Private Keys or Passwords: see default rules: https://falco.org/docs/reference/rules/default-rules/
   * This test creates a temporary pod in kube-system and runs a command that simulates searching for private keys with a unique identifier
   * Then it checks the falcosidekick logs for an alert containing that unique identifier
   * This tests the full e2e pipeline from Falco detection to falcosidekick alerting
   * Note: this requires falcosidekick to be configured in debug mode (or have a registered output) to ensure the alert is logged
   */
  test("Falco detects 'Search Private Keys or Passwords' event and sends to Falco Sidekick", async () => {
    // Generate a random string to identify this test run
    const randomString = Math.random().toString(36).substring(2, 10); // 8-character alphanumeric string

    // Use a temporary pod in kube-system to trigger the Falco event
    await withTempPod(
      {
        name: `falco-test-${randomString}`,
        namespace: "kube-system", // Use kube-system to get around zarf mutations
        image: "alpine:latest",
        command: ["sleep", "3600"],
      },
      async podName => {
        await execAndWait(
          "kube-system",
          podName,
          ["find", `/tmp/test-${randomString}`, "-name", "id_rsa"],
          "main",
        );

        // Poll for the Falco event in falcosidekick logs until success or timeout
        const falcoSidekickEvent = await pollUntilSuccess(
          async () => {
            const falcoSidekickLogs = await getAllLogsByLabelSelector(
              "falco",
              "app.kubernetes.io/name=falcosidekick",
            );
            return falcoSidekickLogs.find(
              log =>
                log.includes("Grep private keys or passwords activities found") &&
                log.includes(`test-${randomString}`),
            );
          },
          result => result !== undefined,
          `Falco event with identifier "test-${randomString}" in falcosidekick logs`,
          60000, // 1 minute timeout
          15000, // 15 seconds interval
        );

        expect(falcoSidekickEvent).toBeDefined();
      },
    );
  }, 70000); // Set test timeout to 70 seconds
});
