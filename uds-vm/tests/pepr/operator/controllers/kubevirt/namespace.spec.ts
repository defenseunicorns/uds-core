/**
 * Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { K8s, kind } from "pepr";
import { beforeEach, describe, expect, Mock, test, vi } from "vitest";
import {
  handlePackage,
  handlePackageDelete,
} from "../../../../../src/pepr/operator/controllers/kubevirt/namespace.js";

type TestPackage = {
  metadata: {
    name: string;
    namespace: string;
    deletionTimestamp?: Date;
  };
  spec?: {
    kubevirt?: {
      enabled?: boolean;
    };
  };
};

vi.mock("pepr", async () => {
  const originalModule = (await vi.importActual("pepr")) as object;
  return {
    ...originalModule,
    K8s: vi.fn(),
  };
});

const mockNamespaceGet = vi.fn();
const mockNamespaceApply = vi.fn();
const mockNamespacePatch = vi.fn();
const mockSecretGet = vi.fn();
const mockSecretCreate = vi.fn();
const mockSecretList = vi.fn();

function makePkg(name: string, ns: string, kubevirtEnabled?: boolean): TestPackage {
  return {
    metadata: { name, namespace: ns },
    spec: kubevirtEnabled !== undefined ? { kubevirt: { enabled: kubevirtEnabled } } : undefined,
  };
}

describe("handlePackage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (K8s as Mock).mockImplementation((resourceKind: unknown) => {
      if (resourceKind === kind.Namespace) {
        return { Get: mockNamespaceGet, Apply: mockNamespaceApply, Patch: mockNamespacePatch };
      }
      if (resourceKind === kind.Secret) {
        return {
          InNamespace: vi.fn().mockReturnValue({ Get: mockSecretGet }),
          Get: mockSecretList,
          Create: mockSecretCreate,
        };
      }
      return { Get: vi.fn() };
    });
  });

  test("sets label and annotation when kubevirt.enabled is true", async () => {
    mockNamespaceGet.mockResolvedValue({
      metadata: { labels: {}, annotations: {} },
    });
    mockSecretGet.mockRejectedValue(new Error("not found"));
    mockSecretList.mockResolvedValue({ items: [] });

    await handlePackage(makePkg("my-pkg", "my-ns", true));

    expect(mockNamespaceApply).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          labels: expect.objectContaining({ "uds.dev/kubevirt-workload": "true" }),
          annotations: expect.objectContaining({ "uds.dev/kubevirt-pkg-my-pkg": "true" }),
        }),
      }),
      { force: true },
    );
  });

  test("does not set label when kubevirt.enabled is false", async () => {
    mockNamespaceGet.mockResolvedValue({
      metadata: { labels: {}, annotations: {} },
    });

    await handlePackage(makePkg("my-pkg", "my-ns", false));

    expect(mockNamespaceApply).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          labels: {},
          annotations: {},
        }),
      }),
      { force: true },
    );
  });

  test("removes label and annotation when last kubevirt package is deleted", async () => {
    mockNamespaceGet.mockResolvedValue({
      metadata: {
        labels: { "uds.dev/kubevirt-workload": "true" },
        annotations: { "uds.dev/kubevirt-pkg-my-pkg": "true" },
      },
    });

    await handlePackageDelete(makePkg("my-pkg", "my-ns", true));

    expect(K8s).toHaveBeenCalledWith(kind.Namespace, { name: "my-ns" });
    expect(mockNamespacePatch).toHaveBeenCalledWith([
      { op: "remove", path: "/metadata/annotations/uds.dev~1kubevirt-pkg-my-pkg" },
      { op: "remove", path: "/metadata/labels/uds.dev~1kubevirt-workload" },
    ]);
    expect(mockNamespaceApply).not.toHaveBeenCalled();
  });

  test("keeps label when other kubevirt packages remain", async () => {
    mockNamespaceGet.mockResolvedValue({
      metadata: {
        labels: { "uds.dev/kubevirt-workload": "true" },
        annotations: {
          "uds.dev/kubevirt-pkg-my-pkg": "true",
          "uds.dev/kubevirt-pkg-other-pkg": "true",
        },
      },
    });

    await handlePackageDelete(makePkg("my-pkg", "my-ns", true));

    expect(K8s).toHaveBeenCalledWith(kind.Namespace, { name: "my-ns" });
    expect(mockNamespacePatch).toHaveBeenCalledWith([
      { op: "remove", path: "/metadata/annotations/uds.dev~1kubevirt-pkg-my-pkg" },
    ]);
    expect(mockNamespaceApply).not.toHaveBeenCalled();
  });

  test("does not call secret API when kubevirt is disabled", async () => {
    mockNamespaceGet.mockResolvedValue({
      metadata: { labels: {}, annotations: {} },
    });

    await handlePackage(makePkg("my-pkg", "my-ns", false));

    expect(mockSecretGet).not.toHaveBeenCalled();
    expect(mockSecretCreate).not.toHaveBeenCalled();
  });

  test("skips reconcile when package has deletionTimestamp", async () => {
    const pkg = makePkg("my-pkg", "my-ns", true);
    pkg.metadata.deletionTimestamp = new Date();

    await handlePackage(pkg);

    expect(mockNamespaceGet).not.toHaveBeenCalled();
    expect(mockNamespaceApply).not.toHaveBeenCalled();
  });
});
