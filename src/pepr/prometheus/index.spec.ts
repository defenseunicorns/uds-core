/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  PodMonitorEndpoint,
  PodMonitorScheme,
  PrometheusPodMonitor,
  PrometheusServiceMonitor,
  ServiceMonitorEndpoint,
  ServiceMonitorScheme,
} from "../operator/crd";
import { FallbackScrapeProtocol } from "../operator/crd/generated/prometheus/servicemonitor-v1";
import { mutatePodMonitor, mutateServiceMonitor } from "./index";

// Mock the logger
vi.mock("../logger", () => {
  return {
    Component: {
      PROMETHEUS: "prometheus",
    },
    setupLogger: vi.fn().mockReturnValue({
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    }),
  };
});

describe("mutateServiceMonitor", () => {
  let serviceMonitor: PrometheusServiceMonitor;

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();

    // Create a basic ServiceMonitor for testing
    serviceMonitor = {
      Raw: {
        metadata: {
          name: "test-service-monitor",
          namespace: "default",
          annotations: {},
        },
        spec: {
          endpoints: [],
        },
      },
    } as PrometheusServiceMonitor;
  });

  it("should set fallbackScrapeProtocol if missing", async () => {
    await mutateServiceMonitor(serviceMonitor);

    expect(serviceMonitor.Raw.spec!.fallbackScrapeProtocol).toBe(
      FallbackScrapeProtocol.PrometheusText004,
    );
  });

  it("should not modify custom scrapeClass that is not istio-certs or exempt", async () => {
    serviceMonitor.Raw.spec!.scrapeClass = "custom-class";

    await mutateServiceMonitor(serviceMonitor);

    expect(serviceMonitor.Raw.spec!.scrapeClass).toBe("custom-class");
  });

  it("should remove scrapeClass when skip annotation is present", async () => {
    serviceMonitor.Raw.spec!.scrapeClass = "istio-certs";
    serviceMonitor.Raw.metadata!.annotations!["uds/skip-mutate"] = "true";

    await mutateServiceMonitor(serviceMonitor);

    expect(serviceMonitor.Raw.spec!.scrapeClass).toBeUndefined();
  });

  it("should remove scrapeClass when specific skip-sm-mutate annotation is present", async () => {
    serviceMonitor.Raw.spec!.scrapeClass = "istio-certs";
    serviceMonitor.Raw.metadata!.annotations!["uds/skip-sm-mutate"] = "true";

    await mutateServiceMonitor(serviceMonitor);

    expect(serviceMonitor.Raw.spec!.scrapeClass).toBeUndefined();
  });

  it("should remove scrapeClass when it equals exempt", async () => {
    serviceMonitor.Raw.spec!.scrapeClass = "exempt";

    await mutateServiceMonitor(serviceMonitor);

    expect(serviceMonitor.Raw.spec!.scrapeClass).toBeUndefined();
  });

  it("should remove istio TLS config and set scheme to HTTP for istio-certs scrapeClass", async () => {
    const endpoint: ServiceMonitorEndpoint = {
      port: "http",
      tlsConfig: {
        caFile: "/etc/prom-certs/root-cert.pem",
        certFile: "/etc/prom-certs/cert-chain.pem",
        keyFile: "/etc/prom-certs/key.pem",
      },
      scheme: ServiceMonitorScheme.HTTPS,
    };

    serviceMonitor.Raw.spec!.scrapeClass = "istio-certs";
    serviceMonitor.Raw.spec!.endpoints = [endpoint];

    await mutateServiceMonitor(serviceMonitor);

    expect(serviceMonitor.Raw.spec!.scrapeClass).toBeUndefined();
    expect(serviceMonitor.Raw.spec!.endpoints![0].tlsConfig).toBeUndefined();
    expect(serviceMonitor.Raw.spec!.endpoints![0].scheme).toBe(ServiceMonitorScheme.HTTP);
  });

  it("should not modify TLS config or scheme that is not Istio TLS", async () => {
    const endpoint: ServiceMonitorEndpoint = {
      port: "https",
      tlsConfig: {
        caFile: "/etc/custom-certs/ca.pem",
        certFile: "/etc/custom-certs/cert.pem",
        keyFile: "/etc/custom-certs/key.pem",
      },
      scheme: ServiceMonitorScheme.HTTPS,
    };

    serviceMonitor.Raw.spec!.scrapeClass = "istio-certs";
    serviceMonitor.Raw.spec!.endpoints = [endpoint];

    await mutateServiceMonitor(serviceMonitor);

    expect(serviceMonitor.Raw.spec!.scrapeClass).toBeUndefined();
    expect(serviceMonitor.Raw.spec!.endpoints![0].tlsConfig).toEqual(endpoint.tlsConfig);
    expect(serviceMonitor.Raw.spec!.endpoints![0].scheme).toBe(ServiceMonitorScheme.HTTPS);
  });
});

describe("mutatePodMonitor", () => {
  let podMonitor: PrometheusPodMonitor;

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();

    // Create a basic PodMonitor for testing
    podMonitor = {
      Raw: {
        metadata: {
          name: "test-pod-monitor",
          namespace: "default",
          annotations: {},
        },
        spec: {
          podMetricsEndpoints: [],
        },
      },
    } as PrometheusPodMonitor;
  });

  it("should set fallbackScrapeProtocol if missing", async () => {
    await mutatePodMonitor(podMonitor);

    expect(podMonitor.Raw.spec!.fallbackScrapeProtocol).toBe(
      FallbackScrapeProtocol.PrometheusText004,
    );
  });

  it("should not modify custom scrapeClass that is not istio-certs or exempt", async () => {
    podMonitor.Raw.spec!.scrapeClass = "custom-class";

    await mutatePodMonitor(podMonitor);

    expect(podMonitor.Raw.spec!.scrapeClass).toBe("custom-class");
  });

  it("should remove scrapeClass when skip annotation is present", async () => {
    podMonitor.Raw.spec!.scrapeClass = "istio-certs";
    podMonitor.Raw.metadata!.annotations!["uds/skip-mutate"] = "true";

    await mutatePodMonitor(podMonitor);

    expect(podMonitor.Raw.spec!.scrapeClass).toBeUndefined();
  });

  it("should remove scrapeClass when specific skip-pm-mutate annotation is present", async () => {
    podMonitor.Raw.spec!.scrapeClass = "istio-certs";
    podMonitor.Raw.metadata!.annotations!["uds/skip-pm-mutate"] = "true";

    await mutatePodMonitor(podMonitor);

    expect(podMonitor.Raw.spec!.scrapeClass).toBeUndefined();
  });

  it("should remove scrapeClass when it equals exempt", async () => {
    podMonitor.Raw.spec!.scrapeClass = "exempt";

    await mutatePodMonitor(podMonitor);

    expect(podMonitor.Raw.spec!.scrapeClass).toBeUndefined();
  });

  it("should set scheme to HTTP for istio-certs scrapeClass", async () => {
    const endpoint: PodMonitorEndpoint = {
      port: "http",
      scheme: PodMonitorScheme.HTTPS,
    };

    podMonitor.Raw.spec!.scrapeClass = "istio-certs";
    podMonitor.Raw.spec!.podMetricsEndpoints = [endpoint];

    await mutatePodMonitor(podMonitor);

    expect(podMonitor.Raw.spec!.scrapeClass).toBeUndefined();
    expect(podMonitor.Raw.spec!.podMetricsEndpoints![0].scheme).toBe(PodMonitorScheme.HTTP);
  });
});
