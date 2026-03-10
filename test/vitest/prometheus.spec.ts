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

  test("all prometheus targets should be up", async () => {
    await pollUntilSuccess(
      async () => {
        const response = await fetch(`${prometheusProxy.url}/api/v1/targets`);
        expect(response.status).toBe(200);

        const body = (await response.json()) as {
          data: {
            activeTargets: Array<{
              scrapePool: string;
              health: string;
            }>;
          };
        };
        expect(body.data).toBeDefined();
        expect(body.data.activeTargets.length).toBeGreaterThan(0);

        return body.data.activeTargets;
      },
      targets => {
        const failedTargets = targets.filter(target => target.health === "down");
        const unknownTargets = targets.filter(target => target.health === "unknown");

        if (unknownTargets.length > 0) {
          for (const target of unknownTargets) {
            console.warn(`Target health is currently unknown: ${target.scrapePool}`);
          }
        }

        if (failedTargets.length > 0) {
          for (const target of failedTargets) {
            console.warn(`Target health is down: ${target.scrapePool}`);
          }
          return false;
        }

        return true;
      },
      "all prometheus targets to be up",
      200000,
      10000,
    );
  });
});
