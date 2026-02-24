/**
 * Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import * as net from "net";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { closeForward, getForward } from "./helpers/forward";
import { pollUntilSuccess } from "./helpers/polling";
import { queryPrometheusMetric } from "./helpers/prometheus";

describe("Uptime Probes", { timeout: 210000 }, () => {
  let prometheusProxy: { server: net.Server; url: string };

  beforeAll(async () => {
    prometheusProxy = await getForward("kube-prometheus-stack-prometheus", "monitoring", 9090);
  });

  afterAll(async () => {
    await closeForward(prometheusProxy.server);
  });

  const expectProbeSuccess = (instance: string) =>
    pollUntilSuccess(
      () => queryPrometheusMetric(prometheusProxy.url, `probe_success{instance="${instance}"}`),
      result => result === 1,
      `probe_success for ${instance}`,
      200000,
    );

  const blackboxTargets = [
    "https://sso.uds.dev/",
    "https://sso.uds.dev/realms/uds/.well-known/openid-configuration",
    "https://keycloak.admin.uds.dev/",
    "https://grafana.admin.uds.dev/healthz",
    "https://ambient-protected.uds.dev/",
    "https://ambient2-protected.uds.dev/",
    "https://protected.uds.dev/",
    "https://demo.admin.uds.dev/status/200",
    "https://demo-8080.uds.dev/",
    "https://demo-8081.uds.dev/",
  ] as const;

  test.concurrent.each(blackboxTargets)("probe_success metric should be 1 for %s", async url => {
    const result = await expectProbeSuccess(url);
    expect(result).toBe(1);
  });
});
