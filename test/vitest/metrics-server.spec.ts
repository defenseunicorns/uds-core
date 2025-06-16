/**
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */
import { describe, test, expect } from "vitest";
import * as k8s from "@kubernetes/client-node";

const kc = new k8s.KubeConfig();
kc.loadFromDefault();

const k8sApi = kc.makeApiClient(k8s.CoreV1Api);
const metricsClient = new k8s.Metrics(kc);

describe("Metrics Server", () => {
  test("metrics-server should return node metrics", async () => {
    const response = await metricsClient.getNodeMetrics();
    expect(response.items.length).toBeGreaterThan(0);
  });

  test("metrics-server should return pod metrics", async () => {
    const response = await metricsClient.getPodMetrics();
    expect(response.items.length).toBeGreaterThan(0);
  });
});
