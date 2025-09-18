/**
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import * as net from "net";
import { K8s, kind } from "kubernetes-fluent-client";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { closeForward, getForward } from "./helpers/forward";

// Global variables
let alertmanagerProxy: { server: net.Server; url: string };

// Helper function to apply the test ConfigMap
const applyTestConfigMap = async (): Promise<void> => {
  const configMap = {
    apiVersion: "v1",
    kind: "ConfigMap",
    metadata: {
      name: "loki-test-rules",
      namespace: "loki",
      labels: {
        loki_rule: "1",
      },
    },
    data: {
      "test-rules.yaml": `groups:
- name: always-firing
  rules:
  - alert: LokiAlwaysFiring
    expr: vector(1)
    for: 0s
    labels:
      severity: test
    annotations:
      summary: "This is a test alert from Loki ruler"
      description: "It always fires to confirm Loki → Alertmanager wiring."
`,
    },
  };

  try {
    // Try to delete existing ConfigMap first (in case of previous test failures)
    await K8s(kind.ConfigMap)
      .InNamespace("loki")
      .Delete("loki-test-rules")
      .catch(() => {
        // Ignore errors if ConfigMap doesn't exist
      });

    // Apply the new ConfigMap
    await K8s(kind.ConfigMap).Apply(configMap);
    console.log("Applied test ConfigMap: loki-test-rules");
  } catch (error) {
    throw new Error(`Failed to apply test ConfigMap: ${error}`);
  }
};

// Helper function to remove the test ConfigMap
const removeTestConfigMap = async (): Promise<void> => {
  try {
    await K8s(kind.ConfigMap).InNamespace("loki").Delete("loki-test-rules");
    console.log("Removed test ConfigMap: loki-test-rules");
  } catch (error) {
    console.warn(`Failed to remove test ConfigMap (may not exist): ${error}`);
  }
};

// Helper function to check if alert is firing in Alertmanager
const checkAlertInAlertmanager = async (alertName: string): Promise<boolean> => {
  try {
    const response = await fetch(`${alertmanagerProxy.url}/api/v2/alerts`);

    if (!response.ok) {
      throw new Error(`Alertmanager API returned ${response.status}`);
    }

    const alerts = (await response.json()) as Array<{
      labels: { alertname: string };
      status: { state: string };
    }>;

    return alerts.some(
      alert => alert.labels.alertname === alertName && alert.status.state === "active",
    );
  } catch (error) {
    throw new Error(`Failed to query Alertmanager: ${error}`);
  }
};

// Helper function to wait for a specified duration
const wait = (ms: number): Promise<void> => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

// Test suite
describe("e2e - Loki Ruler Tests", () => {
  beforeAll(async () => {
    // Set up port forwarding to Alertmanager
    alertmanagerProxy = await getForward("kube-prometheus-stack-alertmanager", "monitoring", 9093);

    // Apply the loki ruler test configMap
    await applyTestConfigMap();
  });

  afterAll(async () => {
    // Clean up port forwarding
    await closeForward(alertmanagerProxy.server);

    // Clean up test ConfigMap
    await removeTestConfigMap();
  });

  test("Loki ruler should send alerts to Alertmanager", async () => {
    // Wait for Loki ruler to pick up the new rule and for the alert to propagate
    // Loki ruler typically evaluates rules every 60s by default, plus propagation time
    console.log("Waiting 2 mins for alert to propagate...");
    await wait(120000); // 2 minutes

    // Check if the alert is firing in Alertmanager
    const isAlertFiring = await checkAlertInAlertmanager("LokiAlwaysFiring");

    expect(isAlertFiring).toBe(true);
  }, 180000); // 2 1/2 minute timeout for the test
});
