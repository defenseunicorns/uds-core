/**
 * Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import * as net from "net";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { closeForward, getForward } from "./helpers/forward";
import { queryPrometheusMetric } from "./helpers/prometheus";

describe("Uptime Probes", { retry: 3 }, () => {
  let prometheusProxy: { server: net.Server; url: string };

  beforeAll(async () => {
    prometheusProxy = await getForward("kube-prometheus-stack-prometheus", "monitoring", 9090);
  });

  afterAll(async () => {
    await closeForward(prometheusProxy.server);
  });

  test("probe_success metric should be 1 for sso.uds.dev", async () => {
    const metric = await queryPrometheusMetric(
      prometheusProxy.url,
      'probe_success{instance="https://sso.uds.dev/"}',
    );
    expect(metric).toBe(1);
  });

  test("probe_success metric should be 1 for keycloak.admin.uds.dev", async () => {
    const metric = await queryPrometheusMetric(
      prometheusProxy.url,
      'probe_success{instance="https://keycloak.admin.uds.dev/"}',
    );
    expect(metric).toBe(1);
  });

  test("probe_success metric should be 1 for grafana.admin.uds.dev/healthz", async () => {
    const metric = await queryPrometheusMetric(
      prometheusProxy.url,
      'probe_success{instance="https://grafana.admin.uds.dev/healthz"}',
    );
    expect(metric).toBe(1);
  });
});
