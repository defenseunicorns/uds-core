/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { K8s, kind } from "pepr";
import { UDSPackage } from "../../crd";
import { writeEvent } from "../../reconcilers";
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
const mockWriteEvent = writeEvent as jest.Mock;

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
          "uds.dev/pkg-test-pkg": IstioState.Sidecar,
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
  test("first package in the namespace - sidecar", async () => {
    mockGet.mockResolvedValue({ metadata: { labels: {}, annotations: {} } });
    const pkg = { metadata: { namespace: "test-ns", name: "test-pkg" }, spec: {} };

    await enableIstio(pkg);

    expect(mockApply).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          labels: { "istio-injection": "enabled" },
          annotations: {
            "uds.dev/pkg-test-pkg": IstioState.Sidecar,
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
  test("first package in the namespace - ambient", async () => {
    mockGet.mockResolvedValue({ metadata: { labels: {}, annotations: {} } });
    const pkg = {
      metadata: { namespace: "test-ns", name: "test-pkg" },
      spec: { network: { serviceMesh: { ambient: true } } },
    };

    await enableIstio(pkg);

    expect(mockApply).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          labels: { "istio.io/dataplane-mode": "ambient" },
          annotations: expect.objectContaining({ "uds.dev/pkg-test-pkg": IstioState.Ambient }),
        }),
      }),
      { force: true },
    );

    // This is a cheap way to check if killPods was called
    expect(mockPodGet).not.toHaveBeenCalled();
  });

  // Test that ambient mode is applied and pods are cycled if original mode was injected
  test("first package in istio injected namespace - ambient", async () => {
    mockGet.mockResolvedValue({
      metadata: { labels: { "istio-injection": "enabled" }, annotations: {} },
    });
    const pkg = {
      metadata: { namespace: "test-ns", name: "test-pkg" },
      spec: { network: { serviceMesh: { ambient: true } } },
    };

    await enableIstio(pkg);

    expect(mockApply).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          labels: { "istio.io/dataplane-mode": "ambient" },
          annotations: expect.objectContaining({ "uds.dev/pkg-test-pkg": IstioState.Ambient }),
        }),
      }),
      { force: true },
    );

    // This is a cheap way to check if killPods was called
    expect(mockPodGet).toHaveBeenCalled();
  });

  // Test that sidecar mode takes precedence over ambient mode on existing packages
  test("second package in namespace - existing ambient, new sidecar", async () => {
    mockGet.mockResolvedValue({
      metadata: {
        labels: { "istio.io/dataplane-mode": "ambient" },
        annotations: { "uds.dev/pkg-existing": IstioState.Ambient },
      },
    });
    const pkg = { metadata: { namespace: "test-ns", name: "test-pkg" }, spec: {} };

    await enableIstio(pkg);

    expect(mockApply).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          labels: { "istio-injection": "enabled" },
          annotations: expect.objectContaining({ "uds.dev/pkg-test-pkg": IstioState.Sidecar }),
        }),
      }),
      { force: true },
    );

    expect(mockWriteEvent).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: { namespace: "test-ns", name: "pkg-existing" } }),
      expect.objectContaining({
        message:
          "Existing package(s) in the namespace are running in sidecar mode, ambient mode will not be enabled",
      }),
    );

    // This is a cheap way to check if killPods was called
    expect(mockPodGet).toHaveBeenCalled();
  });

  // Test that ambient mode is not applied if there are existing sidecar packages
  test("second package in namespace - existing sidecar, new ambient triggers warning", async () => {
    mockGet.mockResolvedValue({
      metadata: {
        labels: { "istio-injection": "enabled" },
        annotations: { "uds.dev/pkg-existing": IstioState.Sidecar },
      },
    });
    const pkg = {
      metadata: { namespace: "test-ns", name: "test-pkg" },
      spec: { network: { serviceMesh: { ambient: true } } },
    };

    await enableIstio(pkg);

    expect(mockApply).not.toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          labels: expect.objectContaining({ "istio.io/dataplane-mode": "ambient" }),
        }),
      }),
    );

    expect(mockWriteEvent).toHaveBeenCalledWith(
      expect.objectContaining(pkg),
      expect.objectContaining({
        message:
          "Existing package(s) in the namespace are running in sidecar mode, ambient mode will not be enabled",
      }),
    );

    // This is a cheap way to check if killPods was called
    expect(mockPodGet).not.toHaveBeenCalled();
  });

  // Test that mode does not change if it is already set
  test("existing package in namespace - no change", async () => {
    mockGet.mockResolvedValue({
      metadata: {
        labels: { "istio-injection": "enabled" },
        annotations: { "uds.dev/pkg-existing": IstioState.Sidecar },
      },
    });
    const pkg = { metadata: { namespace: "test-ns", name: "test-pkg" }, spec: {} };

    await enableIstio(pkg);

    // This is a cheap way to check if killPods was called
    expect(mockPodGet).not.toHaveBeenCalled();
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

  test("last package in namespace - restores none istio mode", async () => {
    mockGet.mockResolvedValue({
      metadata: {
        labels: { "istio-injection": "enabled" },
        annotations: {
          "uds.dev/pkg-test-pkg": IstioState.Sidecar,
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

  test("last package in namespace - restores sidecar istio mode", async () => {
    mockGet.mockResolvedValue({
      metadata: {
        labels: { "istio.io/dataplane-mode": "ambient" },
        annotations: {
          "uds.dev/pkg-test-pkg": IstioState.Ambient,
          "uds.dev/original-istio-state": IstioState.Sidecar,
        },
      },
    });
    const pkg = {
      metadata: { namespace: "test-ns", name: "test-pkg" },
      spec: { network: { serviceMesh: { ambient: true } } },
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

  test("last package in namespace - restores ambient istio mode", async () => {
    mockGet.mockResolvedValue({
      metadata: {
        labels: { "istio-injection": "enabled" },
        annotations: {
          "uds.dev/pkg-test-pkg": IstioState.Sidecar,
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

  test("other packages remain - adjusts istio state if needed", async () => {
    mockGet.mockResolvedValue({
      metadata: {
        labels: { "istio-injection": "enabled" },
        annotations: {
          "uds.dev/pkg-other": IstioState.Ambient,
          "uds.dev/pkg-test-pkg": IstioState.Sidecar,
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
          annotations: expect.objectContaining({
            "uds.dev/original-istio-state": IstioState.Ambient,
          }),
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
