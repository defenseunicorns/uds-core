/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { FallbackScrapeProtocol } from "../operator/crd/generated/prometheus/servicemonitor-v1.js";
import { PrometheusPodMonitor, PrometheusServiceMonitor } from "../operator/crd/index.js";
import { mutatePodMonitor, mutateServiceMonitor } from "./index.js";

vi.mock("./utils", () => ({
  isIstioInjected: vi.fn().mockResolvedValue(true), // Default to true
}));

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

// Mock Pepr K8s
vi.mock("pepr", async () => {
  const actual = await vi.importActual<typeof import("pepr")>("pepr");
  return {
    ...actual,
    K8s: vi.fn(),
    kind: {
      ...actual.kind,
      Namespace: "Namespace",
    },
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

  it("should not redefine fallbackScrapeProtocol if already defined", async () => {
    // Set a different protocol value
    serviceMonitor.Raw.spec!.fallbackScrapeProtocol = FallbackScrapeProtocol.OpenMetricsText100;

    await mutateServiceMonitor(serviceMonitor);

    expect(serviceMonitor.Raw.spec!.fallbackScrapeProtocol).toBe(
      FallbackScrapeProtocol.OpenMetricsText100,
    );
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

  it("should not redefine fallbackScrapeProtocol if already defined", async () => {
    // Set a different protocol value
    podMonitor.Raw.spec!.fallbackScrapeProtocol = FallbackScrapeProtocol.OpenMetricsText100;

    await mutatePodMonitor(podMonitor);

    expect(podMonitor.Raw.spec!.fallbackScrapeProtocol).toBe(
      FallbackScrapeProtocol.OpenMetricsText100,
    );
  });
});
