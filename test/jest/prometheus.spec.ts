/**
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { afterAll, beforeAll, describe, expect, test } from "@jest/globals";
import * as net from "net";
import { closeForward, getForward } from "./forward";

describe("Prometheus and Alertmanager", () => {
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

  // test("alert manager should be firing watchdog alert", async () => {
  //   // The Watchdog configuration uses group_interval: 5m and group_wait: 30s. This test might be executed too quickly
  //   // to catch this. Therefore, we introduce an exponential with 30 times 10000ms (10s) delay, which is more than 6 mins in total.
  //   const maxRetries = 40;
  //   const delay = 10000;
  //   let success = false;
  //
  //   for (let retries = 0; retries < maxRetries; retries++) {
  //     const response = await fetch(
  //       `${alertmanagerProxy.url}/api/v2/alerts/groups?filter=alertname%3D%22Watchdog%22&silenced=false&inhibited=false&active=true`
  //     );
  //
  //     if (response.status === 200) {
  //       const body = (await response.json()) as {
  //         alerts: Array<{ status: { state: string } }>;
  //       }[];
  //
  //       if (body[0]?.alerts[0]?.status.state === "active") {
  //         success = true;
  //         break;
  //       }
  //     }
  //
  //     await new Promise(resolve => setTimeout(resolve, delay));
  //   }
  //
  //   expect(success).toBe(true);
  // });

  test("prometheus web ui should be responsive via the internal service address", async () => {
    const response = await fetch(`${prometheusProxy.url}`);
    expect(response.status).toBe(200);
  });

  test("all prometheus targets should be up", async () => {
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

    const failedTargets = body.data.activeTargets.filter(target => target.health === "down");
    const unknownTargets = body.data.activeTargets.filter(target => target.health === "unknown");

    if (unknownTargets.length > 0) {
      for (const target of unknownTargets) {
        console.warn(`Target health is currently unknown: ${target.scrapePool}`);
      }
    }

    expect(failedTargets).toEqual([]);
  });
});
