/**
 * Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { describe, expect, it } from "vitest";
import { Expose } from "../../crd";
import { UDSConfig } from "../config/config";
import { generateProbe } from "./probe";

UDSConfig.domain = "uds.dev";
UDSConfig.adminDomain = "admin.uds.dev";

describe("generateProbe", () => {
  const ownerRefs = [
    {
      apiVersion: "uds.dev/v1alpha1",
      kind: "Package",
      name: "test",
      uid: "f50120aa-2713-4502-9496-566b102b1174",
    },
  ];

  it("should return a valid Probe object", () => {
    const expose: Expose = {
      host: "app",
      gateway: "tenant",
      uptime: {
        checks: {
          paths: ["/"],
        },
      },
    };
    const namespace = "test";
    const pkgName = "test";
    const generation = "1";

    const payload = generateProbe(expose, namespace, pkgName, generation, ownerRefs);

    expect(payload).toBeDefined();
    expect(payload.metadata?.name).toEqual("uds-app-uds-dev-uptime");
    expect(payload.spec?.module).toEqual("http_2xx");
    expect(payload.spec?.prober?.url).toEqual(
      "prometheus-blackbox-exporter.monitoring.svc.cluster.local:9115",
    );
    expect(payload.spec?.targets?.staticConfig?.static).toEqual(["https://app.uds.dev/"]);
  });

  it("should use custom paths when specified", () => {
    const expose: Expose = {
      host: "app",
      gateway: "tenant",
      uptime: {
        checks: {
          paths: ["/health", "/ready"],
        },
      },
    };

    const payload = generateProbe(expose, "test", "test", "1", ownerRefs);

    expect(payload.spec?.targets?.staticConfig?.static).toEqual([
      "https://app.uds.dev/health",
      "https://app.uds.dev/ready",
    ]);
  });
});
