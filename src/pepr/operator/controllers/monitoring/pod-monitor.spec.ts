/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { describe, expect, it } from "vitest";
import { Monitor } from "../../crd/index.js";
import { generatePodMonitor } from "./pod-monitor.js";

describe("test generate Pod monitor", () => {
  it("should return a valid Pod Monitor object", () => {
    const ownerRefs = [
      {
        apiVersion: "uds.dev/v1alpha1",
        kind: "Package",
        name: "test",
        uid: "f50120aa-2713-4502-9496-566b102b1174",
      },
    ];
    const portName = "http-metrics";
    const metricsPath = "/test";
    const selectorApp = "test";
    const monitor: Monitor = {
      portName: portName,
      path: metricsPath,
      targetPort: 1234,
      selector: {
        app: selectorApp,
      },
    };
    const namespace = "test";
    const pkgName = "test";
    const generation = "1";
    const payload = generatePodMonitor(monitor, namespace, pkgName, generation, ownerRefs);

    expect(payload).toBeDefined();
    expect(payload.metadata?.name).toEqual(`${pkgName}-${selectorApp}-${portName}`);
    expect(payload.metadata?.namespace).toEqual(namespace);
    expect(payload.spec?.podMetricsEndpoints).toBeDefined();
    if (payload.spec?.podMetricsEndpoints) {
      expect(payload.spec.podMetricsEndpoints[0].port).toEqual(portName);
      expect(payload.spec.podMetricsEndpoints[0].path).toEqual(metricsPath);
    }
    expect(payload.spec?.selector.matchLabels).toHaveProperty("app", "test");
  });
});
