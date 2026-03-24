/**
 * Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import * as net from "net";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { closeForward, getForward } from "./helpers/forward";
import { pollUntilSuccess } from "./helpers/polling";

describe("UDS Core Default Alerts", { timeout: 180000, retry: 1 }, () => {
  let prometheusProxy: { server: net.Server; url: string };

  beforeAll(async () => {
    prometheusProxy = await getForward("kube-prometheus-stack-prometheus", "monitoring", 9090);
  });

  afterAll(async () => {
    await closeForward(prometheusProxy.server);
  });

  const alertRules = [
    "UDSProbeEndpointDown",
    "UDSProbeTLSExpiryWarning",
    "UDSProbeTLSExpiryCritical",
  ] as const;

  const fetchAlertRuleNames = async (): Promise<string[]> => {
    const response = await fetch(`${prometheusProxy.url}/api/v1/rules`);
    if (!response.ok) {
      throw new Error(`Prometheus rules API returned ${response.status}`);
    }

    const body = (await response.json()) as {
      status: string;
      data?: {
        groups?: Array<{
          rules?: Array<{
            type?: string;
            name?: string;
          }>;
        }>;
      };
    };

    if (body.status !== "success") {
      throw new Error("Prometheus rules API did not return success");
    }

    return (body.data?.groups ?? [])
      .flatMap(group => group.rules ?? [])
      .filter(rule => rule.type === "alerting" && Boolean(rule.name))
      .map(rule => rule.name as string);
  };

  const expectAlertRulePresent = (alertName: string) =>
    pollUntilSuccess(
      fetchAlertRuleNames,
      names => names.includes(alertName),
      `${alertName} alert rule to be loaded`,
      120000,
      5000,
    );

  test.concurrent.each(alertRules)("alert rule %s should be loaded", async alertRule => {
    const alertRuleNames = await expectAlertRulePresent(alertRule);
    expect(alertRuleNames).toContain(alertRule);
  });
});
