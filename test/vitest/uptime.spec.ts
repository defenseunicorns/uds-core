/**
 * Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import * as net from "net";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { closeForward, getForward } from "./helpers/forward";
import { pollUntilSuccess } from "./helpers/polling";
import { queryPrometheusMetric } from "./helpers/prometheus";

describe("Uptime Probes", { timeout: 180000 }, () => {
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
    );

  test("probe_success metric should be 1 for sso.uds.dev", async () => {
    const result = await expectProbeSuccess("https://sso.uds.dev/");
    expect(result).toBe(1);
  });

  test("probe_success metric should be 1 for sso.uds.dev/realms/uds/.well-known/openid-configuration", async () => {
    const result = await expectProbeSuccess(
      "https://sso.uds.dev/realms/uds/.well-known/openid-configuration",
    );
    expect(result).toBe(1);
  });

  test("probe_success metric should be 1 for keycloak.admin.uds.dev", async () => {
    const result = await expectProbeSuccess("https://keycloak.admin.uds.dev/");
    expect(result).toBe(1);
  });

  test("probe_success metric should be 1 for grafana.admin.uds.dev/healthz", async () => {
    const result = await expectProbeSuccess("https://grafana.admin.uds.dev/healthz");
    expect(result).toBe(1);
  });

  test("probe_success metric should be 1 for ambient-protected.uds.dev", async () => {
    const result = await expectProbeSuccess("https://ambient-protected.uds.dev/");
    expect(result).toBe(1);
  });

  test("probe_success metric should be 1 for ambient2-protected.uds.dev", async () => {
    const result = await expectProbeSuccess("https://ambient2-protected.uds.dev/");
    expect(result).toBe(1);
  });

  test("probe_success metric should be 1 for protected.uds.dev", async () => {
    const result = await expectProbeSuccess("https://protected.uds.dev/");
    expect(result).toBe(1);
  });

  test("probe_success metric should be 1 for demo.admin.uds.dev/status/200", async () => {
    const result = await expectProbeSuccess("https://demo.admin.uds.dev/status/200");
    expect(result).toBe(1);
  });

  test("probe_success metric should be 1 for demo-8080.uds.dev", async () => {
    const result = await expectProbeSuccess("https://demo-8080.uds.dev/");
    expect(result).toBe(1);
  });

  test("probe_success metric should be 1 for demo-8081.uds.dev", async () => {
    const result = await expectProbeSuccess("https://demo-8081.uds.dev/");
    expect(result).toBe(1);
  });
});
