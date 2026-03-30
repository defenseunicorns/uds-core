/**
 * Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */
import { describe, test, expect } from "vitest";
import * as k8s from "@kubernetes/client-node";

const kc = new k8s.KubeConfig();
kc.loadFromDefault();
const appsApi = kc.makeApiClient(k8s.AppsV1Api);

describe("Go Controller", () => {
  test("uds-controller deployment should be available", async () => {
    const deployment = await appsApi.readNamespacedDeployment({
      name: "uds-controller",
      namespace: "uds-system",
    });
    expect(deployment.status?.availableReplicas).toBeGreaterThanOrEqual(1);
  });
});
