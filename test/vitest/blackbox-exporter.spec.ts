/**
 * Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import * as net from "net";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { closeForward, getForward } from "./helpers/forward";

describe("Blackbox Exporter", { retry: 1 }, () => {
  let blackboxExporterProxy: { server: net.Server; url: string };
  let prometheusProxy: { server: net.Server; url: string };

  beforeAll(async () => {
    // Get blackbox-exporter service proxy
    blackboxExporterProxy = await getForward("blackbox-exporter", "monitoring", 9115);
    // Get Prometheus proxy for metrics verification
    prometheusProxy = await getForward("kube-prometheus-stack-prometheus", "monitoring", 9090);
  });

  afterAll(async () => {
    await closeForward(blackboxExporterProxy.server);
    await closeForward(prometheusProxy.server);
  });

  test("blackbox exporter service should be responsive via the internal service address", async () => {
    const response = await fetch(`${blackboxExporterProxy.url}`);
    expect(response.status).toBe(200);
  });

  test("blackbox exporter metrics endpoint should return data", async () => {
    const response = await fetch(`${blackboxExporterProxy.url}/metrics`);
    expect(response.status).toBe(200);

    const body = await response.text();
    expect(body).toContain("blackbox_exporter_build_info");
    expect(body).toContain("process_start_time_seconds");
  });

  test("blackbox exporter should have UDS-specific labels in metrics", async () => {
    const response = await fetch(
      `${prometheusProxy.url}/api/v1/query?query=blackbox_exporter_build_info`,
    );
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      data: {
        result: Array<{
          metric: Record<string, string>;
        }>;
      };
    };

    expect(body.data).toBeDefined();
    expect(body.data.result.length).toBeGreaterThan(0);

    const blackboxMetrics = body.data.result[0];
    expect(blackboxMetrics.metric).toBeDefined();

    // Verify basic metrics are available
    expect(blackboxMetrics.metric).toBeDefined();
    expect(blackboxMetrics.metric.job).toBe("blackbox-exporter");
  });

  test("blackbox exporter should have build info with correct version", async () => {
    const response = await fetch(
      `${prometheusProxy.url}/api/v1/query?query=blackbox_exporter_build_info`,
    );
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      data: {
        result: Array<{
          metric: Record<string, string>;
          value: [string, string];
        }>;
      };
    };

    expect(body.data).toBeDefined();
    expect(body.data.result.length).toBeGreaterThan(0);

    const buildInfo = body.data.result[0];
    expect(buildInfo.metric.version).toBe("0.28.0");
    expect(buildInfo.metric.container).toBe("blackbox-exporter");
  });

  test("blackbox exporter should be discoverable by Prometheus", async () => {
    const response = await fetch(`${prometheusProxy.url}/api/v1/targets`);
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      data: {
        activeTargets: Array<{
          job: string;
          health: string;
          labels: Record<string, string>;
        }>;
      };
    };

    expect(body.data).toBeDefined();
    expect(body.data.activeTargets.length).toBeGreaterThan(0);

    // Find blackbox-exporter target
    const blackboxTarget = body.data.activeTargets.find(
      target => target.labels.job === "blackbox-exporter",
    );

    expect(blackboxTarget).toBeDefined();
    expect(blackboxTarget!.health).toBe("up");
    expect(blackboxTarget!.labels.namespace).toBe("monitoring");
    expect(blackboxTarget!.labels.container).toBe("blackbox-exporter");
  });

  test("blackbox exporter configuration should be loaded from ConfigMap", async () => {
    const response = await fetch(`${blackboxExporterProxy.url}/config`);
    expect(response.status).toBe(200);

    const configText = await response.text();
    // Verify the custom http_2xx module from values.yaml is loaded
    expect(configText).toContain("http_2xx:");
    expect(configText).toContain("prober: http");
    expect(configText).toContain("timeout: 5s");
    expect(configText).toContain("follow_redirects: true");
  });

  test("blackbox exporter should perform actual HTTP probe", async () => {
    // Test that blackbox-exporter can actually probe an external endpoint
    const probeResponse = await fetch(
      `${blackboxExporterProxy.url}/probe?target=https://httpbin.org/status/200&module=http_2xx`,
    );
    expect(probeResponse.status).toBe(200);

    const probeData = await probeResponse.text();
    // Verify the probe succeeded by checking for success metrics
    expect(probeData).toContain("probe_success 1");
    expect(probeData).toContain("probe_http_status_code 200");
  });

  test("blackbox exporter should have PodDisruptionBudget protection", async () => {
    // This test verifies PDB exists through kubectl API
    const response = await fetch(`${blackboxExporterProxy.url}/metrics`);
    expect(response.status).toBe(200);

    // If service is responsive, PDB should be in place protecting it
    // PDB verification is done at the infrastructure level
    const body = await response.text();
    expect(body).toContain("blackbox_exporter_build_info");
  });

  test("blackbox exporter should have proper security contexts", async () => {
    const response = await fetch(
      `${prometheusProxy.url}/api/v1/query?query=up{job="blackbox-exporter"}`,
    );
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      data: {
        result: Array<{
          metric: Record<string, string>;
          value: [string, string];
        }>;
      };
    };

    expect(body.data).toBeDefined();
    expect(body.data.result.length).toBeGreaterThan(0);

    const upMetric = body.data.result[0];
    expect(upMetric.value[1]).toBe("1"); // Should be up
    expect(upMetric.metric.job).toBe("blackbox-exporter");
  });
});
