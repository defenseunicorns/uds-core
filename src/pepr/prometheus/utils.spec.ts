/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { K8s, kind } from "pepr";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PrometheusServiceMonitor } from "../operator/crd";
import { isIstioInjected } from "./utils";

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

describe("isIstioInjected", () => {
  const mockK8sGet = vi.fn();
  const mockK8s = vi.fn(() => ({ Get: mockK8sGet }));

  beforeEach(() => {
    vi.clearAllMocks();
    (K8s as unknown as ReturnType<typeof vi.fn>).mockImplementation(mockK8s);
  });

  it("should return true when namespaceSelector.any is true", async () => {
    const monitor = {
      Raw: {
        metadata: {
          name: "test-monitor",
          namespace: "test-namespace",
        },
        spec: {
          namespaceSelector: {
            any: true,
          },
        },
      },
    } as PrometheusServiceMonitor;

    const result = await isIstioInjected(monitor);

    expect(result).toBe(true);
    // K8s should not be called since we short-circuit when any: true
    expect(K8s).not.toHaveBeenCalled();
  });

  it("should return true if any specified namespace has istio-injection enabled", async () => {
    const monitor = {
      Raw: {
        metadata: {
          name: "test-monitor",
          namespace: "default-namespace",
        },
        spec: {
          namespaceSelector: {
            matchNames: ["test-namespace-1", "test-namespace-2"],
          },
        },
      },
    } as PrometheusServiceMonitor;

    mockK8sGet.mockImplementation(async (ns: string) => {
      if (ns === "test-namespace-2") {
        return {
          metadata: {
            labels: {
              "istio-injection": "enabled",
            },
          },
        };
      }
      return {
        metadata: {
          labels: {},
        },
      };
    });

    const result = await isIstioInjected(monitor);

    expect(result).toBe(true);
    expect(K8s).toHaveBeenCalledWith(kind.Namespace);
    expect(mockK8sGet).toHaveBeenCalledWith("test-namespace-1");
    expect(mockK8sGet).toHaveBeenCalledWith("test-namespace-2");
  });

  it("should return false if no namespace has istio-injection enabled", async () => {
    const monitor = {
      Raw: {
        metadata: {
          name: "test-monitor",
          namespace: "default-namespace",
        },
        spec: {
          namespaceSelector: {
            matchNames: ["test-namespace-1", "test-namespace-2"],
          },
        },
      },
    } as PrometheusServiceMonitor;

    mockK8sGet.mockImplementation(async () => ({
      metadata: {
        labels: {
          "istio-injection": "disabled",
        },
      },
    }));

    const result = await isIstioInjected(monitor);

    expect(result).toBe(false);
    expect(K8s).toHaveBeenCalledWith(kind.Namespace);
    expect(mockK8sGet).toHaveBeenCalledTimes(2);
  });

  it("should fallback to monitor namespace if namespaceSelector.matchNames is not specified", async () => {
    const monitor = {
      Raw: {
        metadata: {
          name: "test-monitor",
          namespace: "default-namespace",
        },
        spec: {},
      },
    } as PrometheusServiceMonitor;

    mockK8sGet.mockImplementation(async (ns: string) => {
      if (ns === "default-namespace") {
        return {
          metadata: {
            labels: {
              "istio-injection": "enabled",
            },
          },
        };
      }
      return {
        metadata: {
          labels: {},
        },
      };
    });

    const result = await isIstioInjected(monitor);

    expect(result).toBe(true);
    expect(K8s).toHaveBeenCalledWith(kind.Namespace);
    expect(mockK8sGet).toHaveBeenCalledWith("default-namespace");
  });
});
