/**
 * Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { describe, expect, it } from "vitest";
import { Expose } from "../../crd";
import { UDSConfig } from "../config/config";
import { generateProbe, getFqdn } from "./probe";

UDSConfig.domain = "uds.dev";
UDSConfig.adminDomain = "admin.uds.dev";

describe("getFqdn", () => {
  it("should return fqdn for tenant gateway", () => {
    const expose: Expose = {
      host: "app",
      gateway: "tenant",
    };
    const fqdn = getFqdn(expose);
    expect(fqdn).toEqual("app.uds.dev");
  });

  it("should return fqdn for admin gateway", () => {
    const expose: Expose = {
      host: "app",
      gateway: "admin",
    };
    const fqdn = getFqdn(expose);
    expect(fqdn).toEqual("app.admin.uds.dev");
  });

  it("should return domain only when host is '.'", () => {
    const expose: Expose = {
      host: ".",
      gateway: "tenant",
    };
    const fqdn = getFqdn(expose);
    expect(fqdn).toEqual("uds.dev");
  });

  it("should use custom domain from UDSConfig", () => {
    const originalDomain = UDSConfig.domain;
    UDSConfig.domain = "custom.example.com";

    const expose: Expose = {
      host: "app",
      gateway: "tenant",
    };
    const fqdn = getFqdn(expose);
    expect(fqdn).toEqual("app.custom.example.com");

    UDSConfig.domain = originalDomain;
  });

  it("should use custom admin domain from UDSConfig", () => {
    const originalAdminDomain = UDSConfig.adminDomain;
    UDSConfig.adminDomain = "admin.custom.example.com";

    const expose: Expose = {
      host: "app",
      gateway: "admin",
    };
    const fqdn = getFqdn(expose);
    expect(fqdn).toEqual("app.admin.custom.example.com");

    UDSConfig.adminDomain = originalAdminDomain;
  });
});

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
          enabled: true,
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
          enabled: true,
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

  it("should include interval and scrapeTimeout when specified", () => {
    const expose: Expose = {
      host: "app",
      gateway: "tenant",
      uptime: {
        checks: {
          enabled: true,
          interval: "30s",
          scrapeTimeout: "10s",
        },
      },
    };

    const payload = generateProbe(expose, "test", "test", "1", ownerRefs);

    expect(payload.spec?.interval).toEqual("30s");
    expect(payload.spec?.scrapeTimeout).toEqual("10s");
  });
});
