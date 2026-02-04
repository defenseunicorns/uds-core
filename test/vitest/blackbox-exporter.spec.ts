/**
 * Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import * as net from "net";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { closeForward, getForward } from "./helpers/forward";

describe("Blackbox Exporter", { retry: 3 }, () => {
  let blackboxExporterProxy: { server: net.Server; url: string };
  let prometheusProxy: { server: net.Server; url: string };

  beforeAll(async () => {
    // Get prometheus-blackbox-exporter service proxy
    blackboxExporterProxy = await getForward("prometheus-blackbox-exporter", "monitoring", 9115);
    // Get Prometheus proxy for metrics verification
    prometheusProxy = await getForward("kube-prometheus-stack-prometheus", "monitoring", 9090);
  });

  afterAll(async () => {
    await closeForward(blackboxExporterProxy.server);
    await closeForward(prometheusProxy.server);
  });

  test("blackbox exporter should probe Prometheus and generate probe metrics", async () => {
    // Test that blackbox-exporter can probe Prometheus and generate probe metrics
    const probeResponse = await fetch(
      `${blackboxExporterProxy.url}/probe?target=http://prometheus-operated.monitoring.svc.cluster.local:9090/metrics&module=http_2xx`,
    );
    expect(probeResponse.status).toBe(200);

    const probeData = await probeResponse.text();
    // Verify the probe succeeded by checking for success metrics
    expect(probeData).toContain("probe_success 1");
    expect(probeData).toContain("probe_http_status_code 200");
    expect(probeData).toContain("probe_duration_seconds");

    // Verify that Prometheus is scraping blackbox-exporter's own metrics
    const metricsResponse = await fetch(
      `${prometheusProxy.url}/api/v1/query?query=up{job="prometheus-blackbox-exporter"}`,
    );
    expect(metricsResponse.status).toBe(200);

    const metricsBody = (await metricsResponse.json()) as {
      data: {
        result: Array<{
          metric: Record<string, string>;
          value: [string, string];
        }>;
      };
    };

    expect(metricsBody.data).toBeDefined();
    expect(metricsBody.data.result.length).toBeGreaterThan(0);

    // Verify blackbox-exporter is up and being scraped
    const upMetrics = metricsBody.data.result.filter(result => result.value[1] === "1");
    expect(upMetrics.length).toBeGreaterThan(0);

    // Verify the blackbox-exporter instance is correctly labeled
    const upMetric = upMetrics[0];
    expect(upMetric.metric.job).toBe("prometheus-blackbox-exporter");
    expect(upMetric.metric.namespace).toBe("monitoring");
  });

  test("blackbox exporter should probe Keycloak service", async () => {
    // Test that blackbox-exporter can probe Keycloak metrics endpoint
    const probeResponse = await fetch(
      `${blackboxExporterProxy.url}/probe?target=http://keycloak-http.keycloak.svc.cluster.local:9000/metrics&module=http_2xx`,
    );
    expect(probeResponse.status).toBe(200);

    const probeData = await probeResponse.text();
    // Verify the probe succeeded by checking for success metrics
    expect(probeData).toContain("probe_success 1");
    expect(probeData).toContain("probe_http_status_code 200");
    expect(probeData).toContain("probe_duration_seconds");

    // Verify that we got a response with content (Keycloak metrics endpoint returns content)
    expect(probeData).toContain("probe_http_content_length");
  });
});
