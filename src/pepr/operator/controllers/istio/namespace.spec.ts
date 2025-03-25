/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { K8s, kind } from "pepr";
import { UDSConfig } from "../../../config";
import { UDSPackage } from "../../crd";
import { Mode } from "../../crd/generated/package-v1alpha1";
import { cleanupNamespace, enableIstio, IstioState, killPods } from "./namespace";

jest.mock("pepr", () => {
  const originalModule = jest.requireActual("pepr") as object;
  return {
    ...originalModule,
    K8s: jest.fn(),
  };
});

jest.mock("../../reconcilers", () => ({
  writeEvent: jest.fn(),
}));

const mockApply = jest.fn();
const mockGet = jest.fn();
const mockPodGet = jest.fn().mockResolvedValue({ items: [] });
const mockPodDelete = jest.fn().mockResolvedValue({});
const mockPackageGet = jest
  .fn()
  .mockResolvedValue({ metadata: { namespace: "test-ns", name: "pkg-existing" } });

describe("enableIstio", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (K8s as jest.Mock).mockImplementation(resourceKind => {
      if (resourceKind === kind.Pod) {
        return { InNamespace: jest.fn().mockReturnValue({ Get: mockPodGet }) };
      }
      if (resourceKind === kind.Namespace) {
        return { Get: mockGet, Apply: mockApply };
      }
      if (resourceKind === UDSPackage) {
        return { InNamespace: jest.fn().mockReturnValue({ Get: mockPackageGet }) };
      }
      return { Get: jest.fn() };
    });
    UDSConfig.isAmbientDeployed = true;
  });

  test("package missing metadata", async () => {
    const pkg = { metadata: { name: "test-pkg" }, spec: {} };

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
        labels: { "istio-injection": "enabled" },
        annotations: {
          "uds.dev/pkg-test-pkg": "true",
          "uds.dev/original-istio-state": IstioState.None,
        },
      },
    });
    const pkg = { metadata: { namespace: "test-ns", name: "test-pkg" }, spec: {} };

    await enableIstio(pkg);

    expect(mockApply).not.toHaveBeenCalled();

    // This is a cheap way to check if killPods was called
    expect(mockPodGet).not.toHaveBeenCalled();
  });

  // Test that istio injection is applied for new packages without ambient mode
  test("sidecar package in plain namespace", async () => {
    mockGet.mockResolvedValue({ metadata: { labels: {}, annotations: {} } });
    const pkg = { metadata: { namespace: "test-ns", name: "test-pkg" }, spec: {} };

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
    const pkg = {
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
    expect(mockPodGet).not.toHaveBeenCalled();
  });

  // Test that ambient mode is applied and pods are cycled if original mode was injected
  test("ambient package in injected namespace", async () => {
    mockGet.mockResolvedValue({
      metadata: { labels: { "istio-injection": "enabled" }, annotations: {} },
    });
    const pkg = {
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

  // Test that ambient mode falls back to sidecar when ambient is not deployed
  test("ambient package falls back to sidecar when ambient is not available", async () => {
    // Temporarily set ambient mode to unavailable
    UDSConfig.isAmbientDeployed = false;

    mockGet.mockResolvedValue({ metadata: { labels: {}, annotations: {}, name: "test-ns" } });
    const pkg = {
      metadata: { namespace: "test-ns", name: "test-pkg" },
      spec: { network: { serviceMesh: { mode: Mode.Ambient } } },
    };

    await enableIstio(pkg);

    // Should apply sidecar mode instead of ambient
    expect(mockApply).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          labels: { "istio-injection": "enabled" },
          annotations: expect.objectContaining({
            "uds.dev/pkg-test-pkg": "true",
            "uds.dev/original-istio-state": IstioState.None,
          }),
        }),
      }),
      { force: true },
    );

    // Verify warning event was written
    expect(jest.requireMock("../../reconcilers").writeEvent).toHaveBeenCalledWith(
      pkg,
      expect.objectContaining({
        reason: "AmbientUnavailable",
        type: "Warning",
      }),
    );

    // This is a cheap way to check if killPods was called
    expect(mockPodGet).toHaveBeenCalled();

    // Restore the original value for other tests
    UDSConfig.isAmbientDeployed = true;
  });
});

describe("cleanupNamespace", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (K8s as jest.Mock).mockImplementation(resourceKind => {
      if (resourceKind === kind.Pod) {
        return { InNamespace: jest.fn().mockReturnValue({ Get: mockPodGet }) };
      }
      if (resourceKind === kind.Namespace) {
        return { Get: mockGet, Apply: mockApply };
      }
      if (resourceKind === UDSPackage) {
        return { InNamespace: jest.fn().mockReturnValue({ Get: mockPackageGet }) };
      }
    });
  });

  test("package missing metadata", async () => {
    const pkg = { metadata: { name: "test-pkg" } };

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
    const pkg = { metadata: { namespace: "test-ns", name: "test-pkg" } };

    await cleanupNamespace(pkg);

    expect(mockApply).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ labels: {}, annotations: {} }),
      }),
      { force: true },
    );

    // This is a cheap way to check if killPods was called
    expect(mockPodGet).not.toHaveBeenCalled();
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
    const pkg = {
      metadata: { namespace: "test-ns", name: "test-pkg" },
      spec: { network: { serviceMesh: { mode: Mode.Ambient } } },
    };

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
    const pkg = { metadata: { namespace: "test-ns", name: "test-pkg" } };

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
});

describe("killPods", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (K8s as jest.Mock).mockImplementation(resourceKind => {
      if (resourceKind === kind.Pod) {
        return {
          InNamespace: jest.fn().mockReturnValue({
            Get: mockPodGet,
          }),
          Delete: mockPodDelete,
        };
      }
      return { Get: jest.fn() };
    });
  });

  test("ignores pods that are already being deleted", async () => {
    mockPodGet.mockResolvedValue({
      items: [{ metadata: { name: "pod1", deletionTimestamp: "2025-02-26T00:00:00Z" } }],
    });

    await killPods("test-ns", true);

    expect(mockPodDelete).not.toHaveBeenCalled();
  });

  test("ignores pods that already have the sidecar when enabling", async () => {
    mockPodGet.mockResolvedValue({
      items: [
        { metadata: { name: "pod1" }, spec: { containers: [{ name: "istio-proxy" }] } },
        { metadata: { name: "pod2" }, spec: { initContainers: [{ name: "istio-proxy" }] } },
      ],
    });

    await killPods("test-ns", true);

    expect(mockPodDelete).not.toHaveBeenCalled();
  });

  test("ignores pods that do not have the sidecar when disabling", async () => {
    mockPodGet.mockResolvedValue({
      items: [{ metadata: { name: "pod1" }, spec: { containers: [{ name: "app-container" }] } }],
    });

    await killPods("test-ns", false);

    expect(mockPodDelete).not.toHaveBeenCalled();
  });

  test("deletes pods that need sidecar injection", async () => {
    mockPodGet.mockResolvedValue({
      items: [{ metadata: { name: "pod1" }, spec: { containers: [{ name: "app-container" }] } }],
    });

    await killPods("test-ns", true);

    expect(mockPodDelete).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: { name: "pod1" } }),
    );
  });

  test("deletes pods that need sidecar removal", async () => {
    mockPodGet.mockResolvedValue({
      items: [{ metadata: { name: "pod1" }, spec: { containers: [{ name: "istio-proxy" }] } }],
    });

    await killPods("test-ns", false);

    expect(mockPodDelete).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: { name: "pod1" } }),
    );
  });

  test("groups pods by owner UID and deletes them", async () => {
    mockPodGet.mockResolvedValue({
      items: [
        {
          metadata: { name: "pod1", ownerReferences: [{ uid: "owner-1", controller: true }] },
          spec: { containers: [{ name: "app-container" }] },
        },
        {
          metadata: { name: "pod2", ownerReferences: [{ uid: "owner-1", controller: true }] },
          spec: { containers: [{ name: "app-container" }] },
        },
      ],
    });

    await killPods("test-ns", true);

    expect(mockPodDelete).toHaveBeenCalledTimes(2);
  });

  test("deletes StatefulSet pods in reverse order", async () => {
    mockPodGet.mockResolvedValue({
      items: [
        {
          metadata: {
            name: "pod-b",
            ownerReferences: [{ uid: "stateful-owner", controller: true, kind: "StatefulSet" }],
          },
          spec: { containers: [{ name: "app-container" }] },
        },
        {
          metadata: {
            name: "pod-a",
            ownerReferences: [{ uid: "stateful-owner", controller: true, kind: "StatefulSet" }],
          },
          spec: { containers: [{ name: "app-container" }] },
        },
      ],
    });

    await killPods("test-ns", true);

    expect(mockPodDelete).toHaveBeenCalledTimes(2);
    expect(mockPodDelete.mock.calls[0][0].metadata.name).toBe("pod-b");
    expect(mockPodDelete.mock.calls[1][0].metadata.name).toBe("pod-a");
  });
});
