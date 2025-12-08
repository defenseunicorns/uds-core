/**
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import * as net from "net";
import { afterAll, beforeAll, describe, test } from "vitest";
import { checkAlertInAlertmanager } from "./helpers/alertmanager";
import { closeForward, getForward } from "./helpers/forward";
import { pollUntilSuccess } from "./helpers/polling";
import { queryPrometheusMetric } from "./helpers/prometheus";

// Global variables
let alertmanagerProxy: { server: net.Server; url: string };
let prometheusProxy: { server: net.Server; url: string };

describe("integration - Loki Ruler Tests", () => {
  beforeAll(async () => {
    // Set up port forwarding to Alertmanager and Prometheus
    alertmanagerProxy = await getForward("kube-prometheus-stack-alertmanager", "monitoring", 9093);
    prometheusProxy = await getForward("kube-prometheus-stack-prometheus", "monitoring", 9090);
  });

  afterAll(async () => {
    // Clean up port forwarding
    await closeForward(alertmanagerProxy.server);
    await closeForward(prometheusProxy.server);
  });

  // Note: The loki-test-rules ConfigMap is deployed as part of the src/test package (loki-ruler-test-configmap.yaml)
  // The following tests assert that the Loki ruler is correctly evaluating rules based on that CM and sending metrics/alerts

  test("Loki ruler should send recording rule metrics to Prometheus", async () => {
    await pollUntilSuccess(
      () => queryPrometheusMetric(prometheusProxy.url, "loki:test_constant"),
      value => value === 1,
      "Checking for loki:test_constant metric with value 1",
      10000, // 10 seconds timeout for poll
      1000, // 1 second interval between polls
    );
  }, 12000); // 12 second total test timeout

  test("Loki ruler should send alerts to Alertmanager", async () => {
    await pollUntilSuccess(
      () => checkAlertInAlertmanager(alertmanagerProxy.url, "LokiAlwaysFiring"),
      isAlertFiring => isAlertFiring === true,
      "Checking for LokiAlwaysFiring alert in Alertmanager",
      10000, // 10 seconds timeout for poll
      1000, // 1 second interval between polls
    );
  }, 12000); // 12 second total test timeout
});
