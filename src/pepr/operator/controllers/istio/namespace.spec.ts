/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { K8s, kind } from "pepr";
import { Mode } from "../../crd/generated/package-v1alpha1.js";
import { UDSPackage } from "../../crd/index.js";
import { cleanupNamespace, enableIstio, IstioState, killPods } from "./namespace.js";

// Import the utility functions for direct testing
// Note: These need to be exported in namespace.ts for testing
import { beforeEach, describe, expect, Mock, test, vi } from "vitest";
import { applyNamespaceUpdates, getCurrentIstioState, getIstioLabels } from "./namespace.js";

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
        return { Apply: mockApply };
      }
      return { Get: vi.fn() };
    });
  });

  test("applies updates when labels change", async () => {
    const namespace = "test-ns";
    const labels = { "new-label": "value" };
    const annotations = { annotation: "value" };
    const originalLabels = { "old-label": "value" };
    const originalAnnotations = { annotation: "value" };

    const result = await applyNamespaceUpdates(
      namespace,
      labels,
      annotations,
      originalLabels,
      originalAnnotations,
    );

    expect(result).toBe(true);
    expect(mockApply).toHaveBeenCalledWith(
      {
        metadata: {
          name: namespace,
          labels,
          annotations,
        },
      },
      { force: true },
    );
  });

  test("applies updates when annotations change", async () => {
    const namespace = "test-ns";
    const labels = { label: "value" };
    const annotations = { "new-annotation": "value" };
    const originalLabels = { label: "value" };
    const originalAnnotations = { "old-annotation": "value" };

    const result = await applyNamespaceUpdates(
      namespace,
      labels,
      annotations,
      originalLabels,
      originalAnnotations,
    );

    expect(result).toBe(true);
    expect(mockApply).toHaveBeenCalledWith(
      {
        metadata: {
          name: namespace,
          labels,
          annotations,
        },
      },
      { force: true },
    );
  });

  test("doesn't apply updates when nothing changes", async () => {
    const namespace = "test-ns";
    const labels = { label: "value" };
    const annotations = { annotation: "value" };
    const originalLabels = { label: "value" };
    const originalAnnotations = { annotation: "value" };

    const result = await applyNamespaceUpdates(
      namespace,
      labels,
      annotations,
      originalLabels,
      originalAnnotations,
    );

    expect(result).toBe(false);
    expect(mockApply).not.toHaveBeenCalled();
  });

  test("uses custom log message when provided", async () => {
    const namespace = "test-ns";
    const labels = { "new-label": "value" };
    const annotations = { annotation: "value" };
    const originalLabels = { "old-label": "value" };
    const originalAnnotations = { annotation: "value" };
    const logMessage = "Custom log message";

    // We can't easily test the log message, but we can verify the function behavior
    const result = await applyNamespaceUpdates(
      namespace,
      labels,
      annotations,
      originalLabels,
      originalAnnotations,
      logMessage,
    );

    expect(result).toBe(true);
    expect(mockApply).toHaveBeenCalled();
  });
});
