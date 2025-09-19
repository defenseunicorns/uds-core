/**
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import * as net from "net";
import { K8s, kind } from "kubernetes-fluent-client";
import { afterAll, beforeAll, describe, test } from "vitest";
import { checkAlertInAlertmanager } from "./helpers/alertmanager";
import { closeForward, getForward } from "./helpers/forward";
import { pollUntilSuccess } from "./helpers/polling";
import { queryPrometheusMetric } from "./helpers/prometheus";

// Global variables
let alertmanagerProxy: { server: net.Server; url: string };
let prometheusProxy: { server: net.Server; url: string };

// Helper function to apply the test ConfigMap that containers Loki ruler alerts and recording rules
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
- name: test-recording
  interval: 5s    # how often to evaluate this rule
  rules:
  - record: loki:test_constant
    expr: vector(1)
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

describe("integration - Loki Ruler Tests", () => {
  beforeAll(async () => {
    // Set up port forwarding to Alertmanager and Prometheus
    alertmanagerProxy = await getForward("kube-prometheus-stack-alertmanager", "monitoring", 9093);
    prometheusProxy = await getForward("kube-prometheus-stack-prometheus", "monitoring", 9090);

    // Apply the loki ruler test configMap before all tests
    await applyTestConfigMap();
  });

  afterAll(async () => {
    // Clean up port forwarding
    await closeForward(alertmanagerProxy.server);
    await closeForward(prometheusProxy.server);

    // Clean up test ConfigMap
    await removeTestConfigMap();
  });

  test("Loki ruler should send recording rule metrics to Prometheus", async () => {
    await pollUntilSuccess(
      () => queryPrometheusMetric(prometheusProxy.url, "loki:test_constant"),
      value => value === 1,
      "Checking for loki:test_constant metric with value 1",
      100000,
    );
  }, 110000);

  test("Loki ruler should send alerts to Alertmanager", async () => {
    await pollUntilSuccess(
      () => checkAlertInAlertmanager(alertmanagerProxy.url, "LokiAlwaysFiring"),
      isAlertFiring => isAlertFiring === true,
      "Checking for LokiAlwaysFiring alert in Alertmanager",
      180000,
    );
  }, 190000);
});
