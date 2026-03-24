/**
 * Copyright 2025-2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { K8s, kind } from "pepr";
import { UDSPackage } from "../../crd";
import { Mode } from "../../crd/generated/package-v1alpha1";
import { cleanupNamespace, enableIstio, IstioState, killPods } from "./namespace";

// Import the utility functions for direct testing
// Note: These need to be exported in namespace.ts for testing
import { beforeEach, describe, expect, Mock, test, vi } from "vitest";
import {
  applyNamespaceUpdates,
  getCurrentIstioState,
  getIstioLabels,
  nsEntryIsOverClaimed,
} from "./namespace";

vi.mock("pepr", async () => {
  const originalModule = (await vi.importActual("pepr")) as object;
  return {
    ...originalModule,
    K8s: vi.fn(),
  };
});

vi.mock("../../reconcilers", () => ({
  writeEvent: vi.fn(),
}));

const mockApply = vi.fn();
const mockPatch = vi.fn().mockResolvedValue({});
const mockGet = vi.fn();
const mockPodGet = vi.fn().mockResolvedValue({ items: [] });
const mockPodDelete = vi.fn().mockResolvedValue({});
const mockPackageGet = vi
  .fn()
  .mockResolvedValue({ metadata: { namespace: "test-ns", name: "pkg-existing" } });

describe("enableIstio", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (K8s as Mock).mockImplementation(resourceKind => {
      if (resourceKind === kind.Pod) {
        return { InNamespace: vi.fn().mockReturnValue({ Get: mockPodGet }) };
      }
      if (resourceKind === kind.Namespace) {
        return { Get: mockGet, Apply: mockApply };
      }
      if (resourceKind === UDSPackage) {
        return { InNamespace: vi.fn().mockReturnValue({ Get: mockPackageGet }) };
      }
      return { Get: vi.fn() };
    });
  });

  test("should not update when labels have same content but different order", async () => {
    // Mock existing namespace with labels in one specific order
    mockGet.mockResolvedValue({
      metadata: {
        labels: {
          "b-label": "value-b",
          "a-label": "value-a",
          "istio.io/dataplane-mode": "ambient",
        },
        annotations: {
          "uds.dev/pkg-test-pkg": "true",
          "uds.dev/original-istio-state": IstioState.None,
        },
      },
    });

    // Create a package that would normally generate the same labels (but potentially in different order)
    const pkg: UDSPackage = {
      metadata: { namespace: "test-ns", name: "test-pkg" },
      spec: {},
    };

    // Run enableIstio
    await enableIstio(pkg);

    // No updates should be applied since content is the same, regardless of key order
    expect(mockApply).not.toHaveBeenCalled();
  });

  test("should update when labels have different content", async () => {
    // Mock existing namespace with labels that don't include istio-injection
    mockGet.mockResolvedValue({
      metadata: {
        labels: {
          "a-label": "value-a",
          "b-label": "value-b",
        },
        annotations: {
          "uds.dev/pkg-test-pkg": "true",
        },
      },
    });

    // Create a package that will cause enableIstio to generate different labels
    const pkg: UDSPackage = {
      metadata: { namespace: "test-ns", name: "test-pkg" },
      spec: {},
    };

    // Run enableIstio (which should add istio-injection: enabled)
    await enableIstio(pkg);

    // Updates should be applied since content is different
    expect(mockApply).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          labels: expect.objectContaining({ "istio.io/dataplane-mode": "ambient" }),
        }),
      }),
      { force: true },
    );
  });

  test("should not update when annotations have same content but different order", async () => {
    // Mock existing namespace with annotations in one specific order
    mockGet.mockResolvedValue({
      metadata: {
        labels: { "istio.io/dataplane-mode": "ambient" },
        annotations: {
          "z-annotation": "value-z",
          "a-annotation": "value-a",
          "uds.dev/pkg-test-pkg": "true",
          "uds.dev/original-istio-state": IstioState.None,
        },
      },
    });

    // Create a package that would normally generate the same annotations (but potentially in different order)
    const pkg: UDSPackage = {
      metadata: { namespace: "test-ns", name: "test-pkg" },
      spec: {},
    };

    // Run enableIstio
    await enableIstio(pkg);

    // No updates should be applied since content is the same, regardless of key order
    expect(mockApply).not.toHaveBeenCalled();
  });

  test("package missing metadata", async () => {
    const pkg: UDSPackage = { metadata: { name: "test-pkg" }, spec: {} };

    try {
      await enableIstio(pkg);
      // Fail test if above expression doesn't throw anything.
      expect(true).toBe(false);
    } catch (e) {
      expect(e).toBeInstanceOf(Error);
    }
  });

  test("package already exists, second reconciliation", async () => {
    mockGet.mockResolvedValue({
      metadata: {
        labels: { "istio.io/dataplane-mode": "ambient" },
        annotations: {
          "uds.dev/pkg-test-pkg": "true",
          "uds.dev/original-istio-state": IstioState.None,
        },
      },
    });
    const pkg: UDSPackage = { metadata: { namespace: "test-ns", name: "test-pkg" }, spec: {} };

    await enableIstio(pkg);

    expect(mockApply).not.toHaveBeenCalled();

    // This is a cheap way to check if killPods was called
    expect(mockPodGet).not.toHaveBeenCalled();
  });

  // Test that istio injection is applied for new packages without ambient mode
  test("sidecar package in plain namespace", async () => {
    mockGet.mockResolvedValue({ metadata: { labels: {}, annotations: {} } });
    const pkg: UDSPackage = {
      metadata: { namespace: "test-ns", name: "test-pkg" },
      spec: { network: { serviceMesh: { mode: Mode.Sidecar } } },
    };

    await enableIstio(pkg);

    expect(mockApply).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          labels: { "istio-injection": "enabled" },
          annotations: {
            "uds.dev/pkg-test-pkg": "true",
            "uds.dev/original-istio-state": IstioState.None,
          },
        }),
      }),
      { force: true },
    );

    // This is a cheap way to check if killPods was called
    expect(mockPodGet).toHaveBeenCalled();
  });

  // Test that ambient mode is applied for new packages with ambient mode
  test("ambient package in plain namespace", async () => {
    mockGet.mockResolvedValue({ metadata: { labels: {}, annotations: {} } });
    const pkg: UDSPackage = { metadata: { namespace: "test-ns", name: "test-pkg" }, spec: {} };

    await enableIstio(pkg);

    expect(mockApply).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          labels: { "istio.io/dataplane-mode": "ambient" },
          annotations: expect.objectContaining({ "uds.dev/pkg-test-pkg": "true" }),
        }),
      }),
      { force: true },
    );

    // This is a cheap way to check if killPods was called
    expect(mockPodGet).not.toHaveBeenCalled();
  });

  // Test that ambient mode is applied and pods are cycled if original mode was injected
  test("ambient package in injected namespace", async () => {
    mockGet.mockResolvedValue({
      metadata: { labels: { "istio-injection": "enabled" }, annotations: {} },
    });
    const pkg: UDSPackage = {
      metadata: { namespace: "test-ns", name: "test-pkg" },
      spec: { network: { serviceMesh: { mode: Mode.Ambient } } },
    };

    await enableIstio(pkg);

    expect(mockApply).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          labels: { "istio.io/dataplane-mode": "ambient" },
          annotations: expect.objectContaining({ "uds.dev/pkg-test-pkg": "true" }),
        }),
      }),
      { force: true },
    );

    // This is a cheap way to check if killPods was called
    expect(mockPodGet).toHaveBeenCalled();
  });

  test("should handle namespace without metadata.labels", async () => {
    mockGet.mockResolvedValue({
      metadata: {
        name: "test-ns",
        annotations: {},
      },
    });

    await enableIstio({
      metadata: {
        name: "test-pkg",
        namespace: "test-ns",
      },
      spec: {
        network: {
          serviceMesh: {
            mode: Mode.Sidecar,
          },
        },
      },
    } as UDSPackage);

    expect(mockApply).toHaveBeenCalled();
    const applyCall = mockApply.mock.calls[0][0];
    expect(applyCall.metadata.labels).toHaveProperty("istio-injection", "enabled");
  });

  test("should handle namespace without metadata.annotations", async () => {
    mockGet.mockResolvedValue({
      metadata: {
        name: "test-ns",
        labels: {},
      },
    });

    await enableIstio({
      metadata: {
        name: "test-pkg",
        namespace: "test-ns",
      },
      spec: {
        network: {
          serviceMesh: {
            mode: Mode.Sidecar,
          },
        },
      },
    } as UDSPackage);

    expect(mockApply).toHaveBeenCalled();
    const applyCall = mockApply.mock.calls[0][0];
    expect(applyCall.metadata.annotations["uds.dev/original-istio-state"]).toBe("none");
  });
});

describe("cleanupNamespace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (K8s as Mock).mockImplementation(resourceKind => {
      if (resourceKind === kind.Pod) {
        return { InNamespace: vi.fn().mockReturnValue({ Get: mockPodGet }) };
      }
      if (resourceKind === kind.Namespace) {
        return { Get: mockGet, Apply: mockApply };
      }
      if (resourceKind === UDSPackage) {
        return { InNamespace: vi.fn().mockReturnValue({ Get: mockPackageGet }) };
      }
      return { Get: vi.fn() };
    });
  });

  test("package missing metadata", async () => {
    const pkg: UDSPackage = { metadata: { name: "test-pkg" } };

    try {
      await cleanupNamespace(pkg);
      // Fail test if above expression doesn't throw anything.
      expect(true).toBe(false);
    } catch (e) {
      expect(e).toBeInstanceOf(Error);
    }
  });

  test("restores none istio mode", async () => {
    mockGet.mockResolvedValue({
      metadata: {
        labels: { "istio-injection": "enabled" },
        annotations: {
          "uds.dev/pkg-test-pkg": "true",
          "uds.dev/original-istio-state": IstioState.None,
        },
      },
    });
    const pkg: UDSPackage = { metadata: { namespace: "test-ns", name: "test-pkg" } };

    await cleanupNamespace(pkg);

    expect(mockApply).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ labels: {}, annotations: {} }),
      }),
      { force: true },
    );

    // This is a cheap way to check if killPods was called
    expect(mockPodGet).toHaveBeenCalled();
  });

  test("restores sidecar istio mode", async () => {
    mockGet.mockResolvedValue({
      metadata: {
        labels: { "istio.io/dataplane-mode": "ambient" },
        annotations: {
          "uds.dev/pkg-test-pkg": "true",
          "uds.dev/original-istio-state": IstioState.Sidecar,
        },
      },
    });
    const pkg: UDSPackage = { metadata: { namespace: "test-ns", name: "test-pkg" } };

    await cleanupNamespace(pkg);

    expect(mockApply).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          labels: { "istio-injection": "enabled" },
          annotations: {},
        }),
      }),
      { force: true },
    );

    // This is a cheap way to check if killPods was called
    expect(mockPodGet).toHaveBeenCalled();
  });

  test("restores ambient istio mode", async () => {
    mockGet.mockResolvedValue({
      metadata: {
        labels: { "istio-injection": "enabled" },
        annotations: {
          "uds.dev/pkg-test-pkg": "true",
          "uds.dev/original-istio-state": IstioState.Ambient,
        },
      },
    });
    const pkg: UDSPackage = { metadata: { namespace: "test-ns", name: "test-pkg" } };

    await cleanupNamespace(pkg);

    expect(mockApply).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          labels: { "istio.io/dataplane-mode": "ambient" },
          annotations: {},
        }),
      }),
      { force: true },
    );

    // This is a cheap way to check if killPods was called
    expect(mockPodGet).toHaveBeenCalled();
  });

  test("should handle namespace without metadata.labels during cleanup", async () => {
    mockGet.mockResolvedValue({
      metadata: {
        name: "test-ns",
        annotations: {
          "uds.dev/istio-original-state": IstioState.None,
          "uds.dev/pkg-test-pkg": IstioState.Sidecar,
        },
      },
    });

    await cleanupNamespace({
      metadata: {
        name: "test-pkg",
        namespace: "test-ns",
      },
    } as UDSPackage);

    expect(mockApply).toHaveBeenCalled();
    const applyCall = mockApply.mock.calls[0][0];
    expect(applyCall.metadata).toHaveProperty("labels");
  });

  test("should handle namespace without metadata.annotations during cleanup", async () => {
    mockGet.mockResolvedValue({
      metadata: {
        name: "test-ns",
        labels: {
          "istio-injection": "enabled",
        },
      },
    });

    await cleanupNamespace({
      metadata: {
        name: "test-pkg",
        namespace: "test-ns",
      },
    } as UDSPackage);

    // Should not throw an error and should attempt to update
    expect(mockApply).toHaveBeenCalled();
  });

  test("should not modify istio labels when other packages exist", async () => {
    mockGet.mockResolvedValue({
      metadata: {
        name: "test-ns",
        labels: {
          "istio-injection": "enabled",
        },
        annotations: {
          "uds.dev/pkg-test-pkg": "true",
          "uds.dev/pkg-other-pkg": "true",
          "uds.dev/original-istio-state": "none",
        },
      },
    });

    await cleanupNamespace({
      metadata: {
        name: "test-pkg",
        namespace: "test-ns",
      },
    } as UDSPackage);

    expect(mockApply).toHaveBeenCalled();
    const applyCall = mockApply.mock.calls[0][0];

    // Verify that the istio-injection label is still present
    expect(applyCall.metadata.labels["istio-injection"]).toBe("enabled");

    // Verify that the original-istio-state annotation is still present
    expect(applyCall.metadata.annotations["uds.dev/original-istio-state"]).toBe("none");

    // Verify that only the specific package annotation was removed
    expect(applyCall.metadata.annotations["uds.dev/pkg-test-pkg"]).toBeUndefined();
    expect(applyCall.metadata.annotations["uds.dev/pkg-other-pkg"]).toBe("true");
  });
});

describe("killPods", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (K8s as Mock).mockImplementation(resourceKind => {
      if (resourceKind === kind.Pod) {
        return {
          InNamespace: vi.fn().mockReturnValue({ Get: mockPodGet }),
          Delete: mockPodDelete,
        };
      }
    });
  });

  test("no pods to kill", async () => {
    mockPodGet.mockResolvedValue({ items: [] });
    await killPods("test-ns", true);
    expect(mockPodDelete).not.toHaveBeenCalled();
  });

  test("skip pods with deletion timestamp", async () => {
    mockPodGet.mockResolvedValue({
      items: [
        {
          metadata: {
            name: "pod-1",
            deletionTimestamp: "2021-01-01T00:00:00Z",
          },
          spec: {
            containers: [{ name: "istio-proxy" }],
          },
        },
      ],
    });
    await killPods("test-ns", true);
    expect(mockPodDelete).not.toHaveBeenCalled();
  });

  test("skip pods that already have sidecar when enabling", async () => {
    mockPodGet.mockResolvedValue({
      items: [
        {
          metadata: { name: "pod-1" },
          spec: {
            containers: [{ name: "istio-proxy" }],
          },
        },
      ],
    });
    await killPods("test-ns", true);
    expect(mockPodDelete).not.toHaveBeenCalled();
  });

  test("skip pods that have sidecar in initContainers when enabling", async () => {
    mockPodGet.mockResolvedValue({
      items: [
        {
          metadata: { name: "pod-1" },
          spec: {
            containers: [{ name: "app" }],
            initContainers: [{ name: "istio-proxy" }],
          },
        },
      ],
    });
    await killPods("test-ns", true);
    expect(mockPodDelete).not.toHaveBeenCalled();
  });

  test("skip pods that don't have sidecar when disabling", async () => {
    mockPodGet.mockResolvedValue({
      items: [
        {
          metadata: { name: "pod-1" },
          spec: {
            containers: [{ name: "app" }],
          },
        },
      ],
    });
    await killPods("test-ns", false);
    expect(mockPodDelete).not.toHaveBeenCalled();
  });

  test("kill pods that don't have sidecar when enabling", async () => {
    mockPodGet.mockResolvedValue({
      items: [
        {
          metadata: { name: "pod-1" },
          spec: {
            containers: [{ name: "app" }],
          },
        },
      ],
    });
    await killPods("test-ns", true);
    expect(mockPodDelete).toHaveBeenCalledTimes(1);
  });

  test("kill pods that have sidecar when disabling", async () => {
    mockPodGet.mockResolvedValue({
      items: [
        {
          metadata: { name: "pod-1" },
          spec: {
            containers: [{ name: "istio-proxy" }],
          },
        },
      ],
    });
    await killPods("test-ns", false);
    expect(mockPodDelete).toHaveBeenCalledTimes(1);
  });

  test("kill pods in reverse order for statefulsets", async () => {
    // Mock the K8s API responses
    mockPodGet.mockResolvedValueOnce({
      items: [
        {
          metadata: {
            name: "pod-0",
            ownerReferences: [
              {
                kind: "StatefulSet",
                uid: "owner-1",
                controller: true,
              },
            ],
          },
          spec: {
            containers: [{ name: "istio-proxy" }],
          },
        },
        {
          metadata: {
            name: "pod-1",
            ownerReferences: [
              {
                kind: "StatefulSet",
                uid: "owner-1",
                controller: true,
              },
            ],
          },
          spec: {
            containers: [{ name: "istio-proxy" }],
          },
        },
      ],
    });

    // Call the function under test
    await killPods("test-ns", false);

    // Verify the pods were deleted in reverse order
    expect(mockPodDelete).toHaveBeenCalledTimes(2);
    expect(mockPodDelete.mock.calls[0][0].metadata.name).toBe("pod-1");
    expect(mockPodDelete.mock.calls[1][0].metadata.name).toBe("pod-0");
  });

  test("handles non-StatefulSet pods correctly", async () => {
    mockPodGet.mockResolvedValue({
      items: [
        {
          metadata: {
            name: "pod-1",
            ownerReferences: [{ kind: "Deployment", controller: true, uid: "owner-1" }],
          },
          spec: {
            containers: [{ name: "istio-proxy" }],
          },
        },
        {
          metadata: {
            name: "pod-2",
            ownerReferences: [{ kind: "Deployment", controller: true, uid: "owner-1" }],
          },
          spec: {
            containers: [{ name: "istio-proxy" }],
          },
        },
      ],
    });
    await killPods("test-ns", false);
    expect(mockPodDelete).toHaveBeenCalledTimes(2);
    // For non-StatefulSet pods, the order should be preserved (not reversed)
    expect(mockPodDelete.mock.calls[0][0].metadata.name).toBe("pod-1");
    expect(mockPodDelete.mock.calls[1][0].metadata.name).toBe("pod-2");
  });

  test("handles pods without ownerReferences correctly", async () => {
    mockPodGet.mockResolvedValue({
      items: [
        {
          metadata: {
            name: "pod-1",
            // No ownerReferences
          },
          spec: {
            containers: [{ name: "istio-proxy" }],
          },
        },
      ],
    });
    await killPods("test-ns", false);
    expect(mockPodDelete).toHaveBeenCalledTimes(1);
  });

  test("handles pods with non-controller ownerReferences correctly", async () => {
    mockPodGet.mockResolvedValue({
      items: [
        {
          metadata: {
            name: "pod-1",
            ownerReferences: [{ kind: "StatefulSet", controller: false, uid: "owner-1" }],
          },
          spec: {
            containers: [{ name: "istio-proxy" }],
          },
        },
      ],
    });
    await killPods("test-ns", false);
    expect(mockPodDelete).toHaveBeenCalledTimes(1);
  });

  test("handles pods with undefined metadata correctly", async () => {
    mockPodGet.mockResolvedValue({
      items: [
        {
          // No metadata
          spec: {
            containers: [{ name: "istio-proxy" }],
          },
        },
      ],
    });
    await killPods("test-ns", false);
    expect(mockPodDelete).toHaveBeenCalledTimes(1);
  });

  test("sorts statefulset pods in reverse order before deletion", async () => {
    // Mock the K8s API responses
    mockPodGet.mockResolvedValueOnce({
      items: [
        {
          metadata: {
            name: "pod-1",
            ownerReferences: [
              {
                kind: "StatefulSet",
                uid: "owner-1",
                controller: true,
              },
            ],
          },
          spec: {
            containers: [{ name: "istio-proxy" }],
          },
        },
        {
          metadata: {
            name: "pod-0",
            ownerReferences: [
              {
                kind: "StatefulSet",
                uid: "owner-1",
                controller: true,
              },
            ],
          },
          spec: {
            containers: [{ name: "istio-proxy" }],
          },
        },
      ],
    });

    // Call the function under test
    await killPods("test-ns", false);

    // Verify the pods were deleted in reverse order
    expect(mockPodDelete).toHaveBeenCalledTimes(2);
    expect(mockPodDelete.mock.calls[0][0].metadata.name).toBe("pod-1");
    expect(mockPodDelete.mock.calls[1][0].metadata.name).toBe("pod-0");
  });
});

describe("getCurrentIstioState", () => {
  test("returns Sidecar when istio-injection is enabled", () => {
    const labels = { "istio-injection": "enabled", "other-label": "value" };
    expect(getCurrentIstioState(labels)).toBe(IstioState.Sidecar);
  });

  test("returns Ambient when istio.io/dataplane-mode is ambient", () => {
    const labels = { "istio.io/dataplane-mode": "ambient", "other-label": "value" };
    expect(getCurrentIstioState(labels)).toBe(IstioState.Ambient);
  });

  test("returns None when no Istio labels are present", () => {
    const labels = { "other-label": "value" };
    expect(getCurrentIstioState(labels)).toBe(IstioState.None);
  });

  test("prioritizes Sidecar over Ambient when both labels are present", () => {
    const labels = {
      "istio-injection": "enabled",
      "istio.io/dataplane-mode": "ambient",
      "other-label": "value",
    };
    expect(getCurrentIstioState(labels)).toBe(IstioState.Sidecar);
  });
});

describe("getIstioLabels", () => {
  test("sets Sidecar mode labels correctly", () => {
    const labels = { "other-label": "value" };
    const result = getIstioLabels(labels, IstioState.Sidecar, IstioState.None);

    expect(result.labels).toEqual({
      "istio-injection": "enabled",
      "other-label": "value",
    });
    expect(result.shouldRestartPods).toBe(true);
  });

  test("sets Ambient mode labels correctly", () => {
    const labels = { "other-label": "value" };
    const result = getIstioLabels(labels, IstioState.Ambient, IstioState.None);

    expect(result.labels).toEqual({
      "istio.io/dataplane-mode": "ambient",
      "other-label": "value",
    });
    expect(result.shouldRestartPods).toBe(false);
  });

  test("sets None mode labels correctly", () => {
    const labels = {
      "istio-injection": "enabled",
      "other-label": "value",
    };
    const result = getIstioLabels(labels, IstioState.None, IstioState.Sidecar);

    expect(result.labels).toEqual({
      "other-label": "value",
    });
    expect(result.shouldRestartPods).toBe(true);
  });

  test("doesn't set shouldRestartPods when no change is needed", () => {
    const labels = { "istio-injection": "enabled", "other-label": "value" };
    const result = getIstioLabels(labels, IstioState.Sidecar, IstioState.Sidecar);

    expect(result.labels).toEqual({
      "istio-injection": "enabled",
      "other-label": "value",
    });
    expect(result.shouldRestartPods).toBe(false);
  });

  test("sets shouldRestartPods when changing from Sidecar to Ambient", () => {
    const labels = { "istio-injection": "enabled", "other-label": "value" };
    const result = getIstioLabels(labels, IstioState.Ambient, IstioState.Sidecar);

    expect(result.labels).toEqual({
      "istio.io/dataplane-mode": "ambient",
      "other-label": "value",
    });
    expect(result.shouldRestartPods).toBe(true);
  });

  test("sets shouldRestartPods when changing from Ambient to Sidecar", () => {
    const labels = { "istio.io/dataplane-mode": "ambient", "other-label": "value" };
    const result = getIstioLabels(labels, IstioState.Sidecar, IstioState.Ambient);

    expect(result.labels).toEqual({
      "istio-injection": "enabled",
      "other-label": "value",
    });
    expect(result.shouldRestartPods).toBe(true);
  });
});

describe("applyNamespaceUpdates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (K8s as Mock).mockImplementation(resourceKind => {
      if (resourceKind === kind.Namespace) {
        return { Apply: mockApply, Patch: mockPatch };
      }
      return { Get: vi.fn() };
    });
  });

  test("applies updates when Istio label changes", async () => {
    const namespace = "test-ns";
    // Simulate switching from sidecar to ambient: new labels have ambient, original had injection
    const labels = { "istio.io/dataplane-mode": "ambient", "non-pepr-label": "value" };
    const annotations = { "uds.dev/pkg-my-app": "true", "non-pepr-annotation": "value" };
    const originalLabels = { "istio-injection": "enabled", "non-pepr-label": "value" };
    const originalAnnotations = { "uds.dev/pkg-my-app": "true", "non-pepr-annotation": "value" };

    const result = await applyNamespaceUpdates(
      namespace,
      labels,
      annotations,
      originalLabels,
      originalAnnotations,
      undefined,
    );

    expect(result).toBe(true);
    // Patch must contain only Pepr-managed keys — non-pepr-label/annotation excluded
    expect(mockApply).toHaveBeenCalledWith(
      {
        metadata: {
          name: namespace,
          labels: { "istio.io/dataplane-mode": "ambient" },
          annotations: { "uds.dev/pkg-my-app": "true" },
        },
      },
      { force: true },
    );
  });

  test("applies updates when package annotation changes", async () => {
    const namespace = "test-ns";
    const labels = { "istio.io/dataplane-mode": "ambient" };
    // New package added
    const annotations = { "uds.dev/pkg-my-app": "true", "uds.dev/pkg-new-app": "true" };
    const originalLabels = { "istio.io/dataplane-mode": "ambient" };
    const originalAnnotations = { "uds.dev/pkg-my-app": "true" };

    const result = await applyNamespaceUpdates(
      namespace,
      labels,
      annotations,
      originalLabels,
      originalAnnotations,
      undefined,
    );

    expect(result).toBe(true);
    expect(mockApply).toHaveBeenCalledWith(
      {
        metadata: {
          name: namespace,
          labels: { "istio.io/dataplane-mode": "ambient" },
          annotations: { "uds.dev/pkg-my-app": "true", "uds.dev/pkg-new-app": "true" },
        },
      },
      { force: true },
    );
  });

  test("doesn't apply updates when Pepr-managed keys are unchanged", async () => {
    const namespace = "test-ns";
    // Non-Pepr labels/annotations differ but Pepr-managed ones are the same
    const labels = { "istio-injection": "enabled", "non-pepr-label": "new-value" };
    const annotations = { "uds.dev/pkg-my-app": "true", "non-pepr-annotation": "new-value" };
    const originalLabels = { "istio-injection": "enabled", "non-pepr-label": "old-value" };
    const originalAnnotations = {
      "uds.dev/pkg-my-app": "true",
      "non-pepr-annotation": "old-value",
    };

    const result = await applyNamespaceUpdates(
      namespace,
      labels,
      annotations,
      originalLabels,
      originalAnnotations,
      undefined,
    );

    expect(result).toBe(false);
    expect(mockApply).not.toHaveBeenCalled();
  });

  test("uses custom log message when provided", async () => {
    const namespace = "test-ns";
    const labels = { "istio.io/dataplane-mode": "ambient" };
    const annotations = { "uds.dev/pkg-my-app": "true" };
    const originalLabels = { "istio-injection": "enabled" };
    const originalAnnotations = { "uds.dev/pkg-my-app": "true" };
    const logMessage = "Custom log message";

    // We can't easily test the log message, but we can verify the function behavior
    const result = await applyNamespaceUpdates(
      namespace,
      labels,
      annotations,
      originalLabels,
      originalAnnotations,
      undefined,
      logMessage,
    );

    expect(result).toBe(true);
    expect(mockApply).toHaveBeenCalled();
  });

  test("applies when setting Istio label for the first time (fresh namespace)", async () => {
    const namespace = "test-ns";
    // Fresh namespace: no Istio labels originally
    const labels = { "istio.io/dataplane-mode": "ambient" };
    const annotations = {
      "uds.dev/pkg-my-app": "true",
      "uds.dev/original-istio-state": "none",
    };
    const originalLabels = { "some-helm-label": "value" };
    const originalAnnotations = {};

    const result = await applyNamespaceUpdates(
      namespace,
      labels,
      annotations,
      originalLabels,
      originalAnnotations,
      undefined,
    );

    expect(result).toBe(true);
    expect(mockApply).toHaveBeenCalledWith(
      {
        metadata: {
          name: namespace,
          labels: { "istio.io/dataplane-mode": "ambient" },
          annotations: {
            "uds.dev/pkg-my-app": "true",
            "uds.dev/original-istio-state": "none",
          },
        },
      },
      { force: true },
    );
  });

  test("applies when removing an Istio label (cleanup to None state)", async () => {
    const namespace = "test-ns";
    // After getIstioLabels for None state, injection key is deleted from the map
    const labels = { "some-helm-label": "value" }; // no Istio keys
    const annotations = {};
    const originalLabels = { "istio-injection": "enabled", "some-helm-label": "value" };
    const originalAnnotations = {
      "uds.dev/pkg-my-app": "true",
      "uds.dev/original-istio-state": "none",
    };

    const result = await applyNamespaceUpdates(
      namespace,
      labels,
      annotations,
      originalLabels,
      originalAnnotations,
      undefined,
    );

    expect(result).toBe(true);
    // Sparse patch has no Istio labels — SSA will remove the key from the live object
    expect(mockApply).toHaveBeenCalledWith(
      {
        metadata: {
          name: namespace,
          labels: {},
          annotations: {},
        },
      },
      { force: true },
    );
  });

  test("applies when removing a package annotation (last package cleaned up)", async () => {
    const namespace = "test-ns";
    const labels = { "istio.io/dataplane-mode": "ambient" };
    // Last package annotation removed; original-istio-state also deleted by cleanupNamespace
    const annotations = {};
    const originalLabels = { "istio.io/dataplane-mode": "ambient" };
    const originalAnnotations = {
      "uds.dev/pkg-my-app": "true",
      "uds.dev/original-istio-state": "none",
    };

    const result = await applyNamespaceUpdates(
      namespace,
      labels,
      annotations,
      originalLabels,
      originalAnnotations,
      undefined,
    );

    expect(result).toBe(true);
    expect(mockApply).toHaveBeenCalledWith(
      {
        metadata: {
          name: namespace,
          labels: { "istio.io/dataplane-mode": "ambient" },
          annotations: {},
        },
      },
      { force: true },
    );
  });

  test("applies when adding the original-istio-state annotation", async () => {
    const namespace = "test-ns";
    const labels = { "istio-injection": "enabled" };
    const annotations = {
      "uds.dev/pkg-my-app": "true",
      "uds.dev/original-istio-state": "none",
    };
    const originalLabels = {};
    const originalAnnotations = {};

    const result = await applyNamespaceUpdates(
      namespace,
      labels,
      annotations,
      originalLabels,
      originalAnnotations,
      undefined,
    );

    expect(result).toBe(true);
    expect(mockApply).toHaveBeenCalledWith(
      {
        metadata: {
          name: namespace,
          labels: { "istio-injection": "enabled" },
          annotations: {
            "uds.dev/pkg-my-app": "true",
            "uds.dev/original-istio-state": "none",
          },
        },
      },
      { force: true },
    );
  });

  test("applies when originalLabels and originalAnnotations are undefined (brand-new namespace)", async () => {
    const namespace = "test-ns";
    const labels = { "istio.io/dataplane-mode": "ambient" };
    const annotations = {
      "uds.dev/pkg-my-app": "true",
      "uds.dev/original-istio-state": "none",
    };

    const result = await applyNamespaceUpdates(
      namespace,
      labels,
      annotations,
      undefined,
      undefined,
      undefined,
    );

    expect(result).toBe(true);
    expect(mockApply).toHaveBeenCalledWith(
      {
        metadata: {
          name: namespace,
          labels: { "istio.io/dataplane-mode": "ambient" },
          annotations: {
            "uds.dev/pkg-my-app": "true",
            "uds.dev/original-istio-state": "none",
          },
        },
      },
      { force: true },
    );
  });

  test("strips over-claimed managedFields entry before applying when Pepr owns non-managed labels", async () => {
    const namespace = "test-ns";
    const labels = { "istio.io/dataplane-mode": "ambient" };
    const annotations = { "uds.dev/pkg-my-app": "true" };
    const originalLabels = { "istio-injection": "enabled" };
    const originalAnnotations = { "uds.dev/pkg-my-app": "true" };
    // Pepr's entry owns a non-managed label (helm.sh/chart)
    const managedFields = [
      {
        manager: "pepr",
        operation: "Apply",
        fieldsV1: {
          "f:metadata": {
            "f:labels": { "f:istio-injection": {}, "f:helm.sh/chart": {} },
          },
        },
      },
    ];

    await applyNamespaceUpdates(
      namespace,
      labels,
      annotations,
      originalLabels,
      originalAnnotations,
      managedFields,
    );

    // Patch to strip over-claimed entry should be called before Apply
    expect(mockPatch).toHaveBeenCalledWith([
      { op: "test", path: "/metadata/managedFields/0/manager", value: "pepr" },
      { op: "test", path: "/metadata/managedFields/0/operation", value: "Apply" },
      { op: "remove", path: "/metadata/managedFields/0" },
    ]);
    expect(mockApply).toHaveBeenCalled();
  });

  test("does not strip managedFields when Pepr entry only has managed labels", async () => {
    const namespace = "test-ns";
    const labels = { "istio.io/dataplane-mode": "ambient" };
    const annotations = { "uds.dev/pkg-my-app": "true" };
    const originalLabels = { "istio-injection": "enabled" };
    const originalAnnotations = { "uds.dev/pkg-my-app": "true" };
    // Pepr's entry only owns managed labels
    const managedFields = [
      {
        manager: "pepr",
        operation: "Apply",
        fieldsV1: {
          "f:metadata": {
            "f:labels": { "f:istio-injection": {} },
            "f:annotations": { "f:uds.dev/pkg-my-app": {} },
          },
        },
      },
    ];

    await applyNamespaceUpdates(
      namespace,
      labels,
      annotations,
      originalLabels,
      originalAnnotations,
      managedFields,
    );

    expect(mockPatch).not.toHaveBeenCalled();
    expect(mockApply).toHaveBeenCalled();
  });

  test("cleans up and re-applies when over-claimed but Pepr-managed values are unchanged", async () => {
    const namespace = "test-ns";
    // Same Istio label before and after — no value change
    const labels = { "istio-injection": "enabled" };
    const annotations = { "uds.dev/pkg-my-app": "true" };
    const originalLabels = { "istio-injection": "enabled" };
    const originalAnnotations = { "uds.dev/pkg-my-app": "true" };
    // Pepr's entry over-claims a non-managed label
    const managedFields = [
      {
        manager: "pepr",
        operation: "Apply",
        fieldsV1: {
          "f:metadata": {
            "f:labels": { "f:istio-injection": {}, "f:helm.sh/chart": {} },
          },
        },
      },
    ];

    const result = await applyNamespaceUpdates(
      namespace,
      labels,
      annotations,
      originalLabels,
      originalAnnotations,
      managedFields,
    );

    // Values didn't change, so return false (no pod cycling needed)
    expect(result).toBe(false);
    // But we still cleaned up and re-applied to fix SSA ownership
    expect(mockPatch).toHaveBeenCalledWith([
      { op: "test", path: "/metadata/managedFields/0/manager", value: "pepr" },
      { op: "test", path: "/metadata/managedFields/0/operation", value: "Apply" },
      { op: "remove", path: "/metadata/managedFields/0" },
    ]);
    expect(mockApply).toHaveBeenCalledWith(
      {
        metadata: {
          name: namespace,
          labels: { "istio-injection": "enabled" },
          annotations: { "uds.dev/pkg-my-app": "true" },
        },
      },
      { force: true },
    );
  });

  test("proceeds to Apply when the managedFields Patch fails", async () => {
    const namespace = "test-ns";
    mockPatch.mockRejectedValueOnce(new Error("test op failed"));
    const labels = { "istio.io/dataplane-mode": "ambient" };
    const annotations = { "uds.dev/pkg-my-app": "true" };
    const originalLabels = { "istio-injection": "enabled" };
    const originalAnnotations = { "uds.dev/pkg-my-app": "true" };
    const managedFields = [
      {
        manager: "pepr",
        operation: "Apply",
        fieldsV1: {
          "f:metadata": {
            "f:labels": { "f:istio-injection": {}, "f:helm.sh/chart": {} },
          },
        },
      },
    ];

    const result = await applyNamespaceUpdates(
      namespace,
      labels,
      annotations,
      originalLabels,
      originalAnnotations,
      managedFields,
    );

    expect(result).toBe(true);
    expect(mockPatch).toHaveBeenCalled();
    // Apply must still run even though the Patch failed
    expect(mockApply).toHaveBeenCalled();
  });
});

describe("nsEntryIsOverClaimed", () => {
  test("returns false when fieldsV1 is empty", () => {
    expect(nsEntryIsOverClaimed({ manager: "pepr", operation: "Apply", fieldsV1: {} })).toBe(false);
  });

  test("returns false when only managed labels are present", () => {
    expect(
      nsEntryIsOverClaimed({
        fieldsV1: {
          "f:metadata": {
            "f:labels": { "f:istio-injection": {}, "f:istio.io/dataplane-mode": {} },
          },
        },
      }),
    ).toBe(false);
  });

  test("returns false when only managed annotations are present", () => {
    expect(
      nsEntryIsOverClaimed({
        fieldsV1: {
          "f:metadata": {
            "f:annotations": {
              "f:uds.dev/original-istio-state": {},
              "f:uds.dev/pkg-foo": {},
              "f:uds.dev/pkg-bar": {},
            },
          },
        },
      }),
    ).toBe(false);
  });

  test("returns true when a non-managed label is present", () => {
    expect(
      nsEntryIsOverClaimed({
        fieldsV1: {
          "f:metadata": {
            "f:labels": { "f:istio-injection": {}, "f:helm.sh/chart": {} },
          },
        },
      }),
    ).toBe(true);
  });

  test("returns true when a non-managed annotation is present", () => {
    expect(
      nsEntryIsOverClaimed({
        fieldsV1: {
          "f:metadata": {
            "f:annotations": {
              "f:uds.dev/pkg-foo": {},
              "f:kubectl.kubernetes.io/last-applied-configuration": {},
            },
          },
        },
      }),
    ).toBe(true);
  });

  test("returns true when fieldsV1 has a top-level key beyond f:metadata", () => {
    expect(
      nsEntryIsOverClaimed({
        fieldsV1: {
          "f:metadata": {
            "f:labels": { "f:istio-injection": {} },
          },
          "f:status": {},
        },
      }),
    ).toBe(true);
  });

  test("returns true when f:metadata has an unexpected sub-key beyond f:labels and f:annotations", () => {
    expect(
      nsEntryIsOverClaimed({
        fieldsV1: {
          "f:metadata": {
            "f:labels": { "f:istio-injection": {} },
            "f:finalizers": {},
          },
        },
      }),
    ).toBe(true);
  });
});
