/**
 * Copyright 2025-2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import * as k8s from "@kubernetes/client-node";
import { describe, expect, test } from "vitest";
import { getAllLogsByLabelSelector, execAndWait, withTempPod } from "./helpers/k8s";
import { pollUntilSuccess } from "./helpers/polling";

describe("Falco e2e Tests", () => {
  test("reports Falco coverage across Ready Linux nodes", async () => {
    let coverage: { nodeCount: number; missingNodeNames: string[] } | undefined;

    try {
      const kc = new k8s.KubeConfig();
      kc.loadFromDefault();
      const core = kc.makeApiClient(k8s.CoreV1Api);
      await pollUntilSuccess(
        async () => {
          const [nodes, pods] = await Promise.all([
            core.listNode({}),
            core.listNamespacedPod({
              namespace: "falco",
              labelSelector: "app.kubernetes.io/name=falco",
            }),
          ]);
          const readyNodeNames = nodes.items
            .filter(
              node =>
                node.metadata?.labels?.["kubernetes.io/os"] === "linux" &&
                node.status?.conditions?.some(
                  condition => condition.type === "Ready" && condition.status === "True",
                ),
            )
            .map(node => node.metadata?.name)
            .filter((name): name is string => !!name);
          const falcoNodeNames = new Set(
            pods.items
              .filter(pod =>
                pod.status?.conditions?.some(
                  condition => condition.type === "Ready" && condition.status === "True",
                ),
              )
              .map(pod => pod.spec?.nodeName),
          );

          coverage = {
            nodeCount: readyNodeNames.length,
            missingNodeNames: readyNodeNames.filter(name => !falcoNodeNames.has(name)),
          };
          return coverage.nodeCount > 0 && coverage.missingNodeNames.length === 0;
        },
        covered => covered,
        "a Ready Falco Pod on every Ready Linux node",
        60000,
        5000,
      );
      console.info(`Falco coverage: Ready Pods on all ${coverage?.nodeCount} Ready Linux nodes.`);
    } catch (error) {
      if (!coverage) {
        console.warn(`Falco coverage check could not complete: ${String(error)}`);
      } else if (coverage.nodeCount === 0) {
        console.warn("Falco coverage check found no Ready Linux nodes.");
      } else {
        console.warn(
          `Falco coverage finding: no Ready Falco Pod on ${coverage.missingNodeNames.length} of ${coverage.nodeCount} Ready Linux nodes: ${coverage.missingNodeNames.join(", ")}. ` +
            "For complete runtime coverage, run Falco on every Ready Linux node. Inspect node taints and Falco Pod events, then add matching falco.uds-falco-config.extraTolerations when taints prevent scheduling.",
        );
      }
    }
  }, 90000);

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
        // Retrigger the event on each poll attempt so transient eBPF misses don't cause a timeout
        const falcoSidekickEvent = await pollUntilSuccess(
          async () => {
            await execAndWait(
              "kube-system",
              podName,
              ["find", `/tmp/test-${randomString}`, "-name", "id_rsa"],
              "main",
            );
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
          120000, // 2 minute timeout
          15000, // 15 seconds interval
        );

        expect(falcoSidekickEvent).toBeDefined();
      },
    );
  }, 150000); // 150s to cover pod creation + 120s poll
});
