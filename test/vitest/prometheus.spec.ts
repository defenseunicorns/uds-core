/**
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import * as net from "net";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { closeForward, getForward } from "./helpers/forward";
import { pollUntilSuccess } from "./helpers/polling";

describe("Prometheus and Alertmanager", { retry: 1 }, () => {
  let prometheusProxy: { server: net.Server; url: string };
  let alertmanagerProxy: { server: net.Server; url: string };

  beforeAll(async () => {
    prometheusProxy = await getForward("kube-prometheus-stack-prometheus", "monitoring", 9090);
    alertmanagerProxy = await getForward("kube-prometheus-stack-alertmanager", "monitoring", 9093);
  });

  afterAll(async () => {
    await closeForward(prometheusProxy.server);
    await closeForward(alertmanagerProxy.server);
  });

  test("alert manager service should be responsive via the internal service address", async () => {
    const response = await fetch(`${alertmanagerProxy.url}`);
    expect(response.status).toBe(200);
  });

  test("alert manager should be firing watchdog alert", async () => {
    const response = await fetch(`${alertmanagerProxy.url}/api/v2/alerts`);

    expect(response.status).toBe(200);
    const body = (await response.json()) as Array<{
      labels: { alertname: string };
      status: { state: string };
    }>;

    expect(
      body.some(alert => alert.labels.alertname === "Watchdog" && alert.status.state === "active"),
    ).toBe(true);
  });

  test("prometheus web ui should be responsive via the internal service address", async () => {
    const response = await fetch(`${prometheusProxy.url}`);
    expect(response.status).toBe(200);
  });

  test("all prometheus targets should be up", { timeout: 220000 }, async () => {
    const targets = await pollUntilSuccess(
      async () => {
        const response = await fetch(`${prometheusProxy.url}/api/v1/targets`);
        if (!response.ok) {
          throw new Error(`Prometheus targets API returned ${response.status}`);
        }

        const body = (await response.json()) as {
          data: {
            activeTargets: Array<{
              scrapePool: string;
              health: string;
            }>;
          };
        };

        if (!body.data?.activeTargets?.length) {
          throw new Error("No active targets returned from Prometheus");
        }

        return body.data.activeTargets;
      },
      targets => {
        // Exclude policy-tests namespace — probes created there by pepr-policies/probe.spec.ts
        // may linger in Prometheus briefly after teardown, causing false failures.
        const unhealthy = targets.filter(
          target => target.health !== "up" && !target.scrapePool.includes("/policy-tests/"),
        );
        for (const target of unhealthy) {
          console.warn(`Target ${target.scrapePool} is ${target.health}`);
        }
        return unhealthy.length === 0;
      },
      "all prometheus targets to be up",
      200000,
      10000,
    );

    // Same exclusion as the polling condition above — see pepr-policies/probe.spec.ts
    expect(
      targets
        .filter(target => !target.scrapePool.includes("/policy-tests/"))
        .every(target => target.health === "up"),
    ).toBe(true);
  });
});
