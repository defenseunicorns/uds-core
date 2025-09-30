/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import * as net from "net";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { closeForward, getForward } from "./helpers/forward";
import { execAndWait, withTempPod } from "./helpers/k8s";
import { queryLoki } from "./helpers/loki";
import { pollUntilSuccess } from "./helpers/polling";

describe("Falco Integration e2e Tests", () => {
  let lokiRead: { server: net.Server; url: string };

  beforeAll(async () => {
    lokiRead = await getForward("loki-read", "loki", 3100);
  });

  afterAll(async () => {
    await closeForward(lokiRead.server);
  });

  /*
   * Test Falco detection of rule Search Private Keys or Passwords: see default rules: https://falco.org/docs/reference/rules/default-rules/
   * This test creates a temporary pod in kube-system and runs a command that simulates searching for private keys with a unique identifier
   * Then it checks that this event appears in Loki
   */
  test("Falco detects 'Search Private Keys or Passwords' event and logs appear in Loki", async () => {
    const randomString = Math.random().toString(36).substring(2, 10);

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
      },
    );
  }, 70000); // Set test timeout to 70 seconds

  // test("Falco detects 'Write below root' event and sends to Falco Sidekick", async () => {
  //   // Generate a random string to identify this test run
  //   const randomString = Math.random().toString(36).substring(2, 10);

  //   // Use a temporary pod in kube-system to trigger the Falco event
  //   await withTempPod(
  //     {
  //       name: `falco-write-test-${randomString}`,
  //       namespace: "kube-system", // Use kube-system to get around zarf mutations
  //       image: "alpine:latest",
  //       command: ["sleep", "3600"],
  //     },
  //     async podName => {
  //       // Try to write to a system directory (should trigger the rule)
  //       await execAndWait(
  //         "kube-system",
  //         podName,
  //         ["sh", "-c", `echo "test" >> /etc/passwd`],
  //         "main",
  //       );

  //       // Poll for the Falco event in falcosidekick logs until success or timeout
  //       const falcoSidekickEvent = await pollUntilSuccess(
  //         async () => {
  //           const falcoSidekickLogs = await getAllLogsByLabelSelector(
  //             "falco",
  //             "app.kubernetes.io/name=falcosidekick",
  //           );
  //           return falcoSidekickLogs.find(
  //             log =>
  //               log.includes('"rule":"Write below etc"') &&
  //               log.includes("File below /etc opened for writing") &&
  //               log.includes("file=/etc/passwd"),
  //           );
  //         },
  //         result => result !== undefined,
  //         "Falco event for write to /etc/passwd in falcosidekick logs",
  //         60000, // 1 minute timeout
  //         15000, // 15 seconds interval
  //       );

  //       expect(falcoSidekickEvent).toBeDefined();
  //     },
  //   );
  // }, 70000); // Set test timeout to 70 seconds

  // test("Falco detects 'Read environment variables from /proc files' event and sends to Falco Sidekick", async () => {
  //   // Generate a random string to identify this test run
  //   const randomString = Math.random().toString(36).substring(2, 10);

  //   // Use a temporary pod in kube-system to trigger the Falco event
  //   await withTempPod(
  //     {
  //       name: `falco-proc-env-test-${randomString}`,
  //       namespace: "kube-system", // Use kube-system to get around zarf mutations
  //       image: "alpine:latest",
  //       command: ["sleep", "3600"],
  //     },
  //     async podName => {
  //       // Try to read environment variables from /proc/1/environ
  //       await execAndWait("kube-system", podName, ["sh", "-c", "cat /proc/1/environ"], "main");

  //       // Poll for the Falco event in falcosidekick logs until success or timeout
  //       const falcoSidekickEvent = await pollUntilSuccess(
  //         async () => {
  //           const falcoSidekickLogs = await getAllLogsByLabelSelector(
  //             "falco",
  //             "app.kubernetes.io/name=falcosidekick",
  //           );
  //           return falcoSidekickLogs.find(
  //             log =>
  //               log.includes('"rule":"Read environment variable from /proc files"') &&
  //               log.includes("Environment variables") &&
  //               log.includes("file=/proc/1/environ"),
  //           );
  //         },
  //         result => result !== undefined,
  //         "Falco event for reading /proc/1/environ in falcosidekick logs",
  //         60000, // 1 minute timeout
  //         15000, // 15 seconds interval
  //       );

  //       expect(falcoSidekickEvent).toBeDefined();
  //     },
  //   );
  // }, 70000); // Set test timeout to 70 seconds
});
