/**
 * Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { V1ManagedFieldsEntry } from "@kubernetes/client-node";
import { K8s, kind } from "pepr";
import { Logger } from "pino";
import { beforeEach, describe, expect, Mock, test, vi } from "vitest";
import { PEPR_FIELD_MANAGER, removePeprManagedFieldsEntry } from "./ssa-field-cleanup";

vi.mock("pepr", async () => {
  const originalModule = (await vi.importActual("pepr")) as object;
  return { ...originalModule, K8s: vi.fn() };
});

const mockPatch = vi.fn().mockResolvedValue({});
const mockLog = { warn: vi.fn(), debug: vi.fn() } as unknown as Logger;

describe("removePeprManagedFieldsEntry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (K8s as Mock).mockReturnValue({ Patch: mockPatch });
  });

  test("no-op when managedFields is empty", async () => {
    await removePeprManagedFieldsEntry(kind.Namespace, "test-ns", undefined, [], mockLog);
    expect(mockPatch).not.toHaveBeenCalled();
  });

  test("no-op when there is no Pepr Apply entry", async () => {
    const managedFields: V1ManagedFieldsEntry[] = [
      { manager: "helm", operation: "Apply", fieldsV1: {} },
    ];
    await removePeprManagedFieldsEntry(
      kind.Namespace,
      "test-ns",
      undefined,
      managedFields,
      mockLog,
    );
    expect(mockPatch).not.toHaveBeenCalled();
  });

  test("issues remove patch at the correct index when Pepr entry is first", async () => {
    const managedFields: V1ManagedFieldsEntry[] = [
      { manager: PEPR_FIELD_MANAGER, operation: "Apply", fieldsV1: {} },
      { manager: "helm", operation: "Apply", fieldsV1: {} },
    ];
    await removePeprManagedFieldsEntry(
      kind.Namespace,
      "test-ns",
      undefined,
      managedFields,
      mockLog,
    );
    expect(mockPatch).toHaveBeenCalledWith([
      { op: "test", path: "/metadata/managedFields/0/manager", value: PEPR_FIELD_MANAGER },
      { op: "test", path: "/metadata/managedFields/0/operation", value: "Apply" },
      { op: "remove", path: "/metadata/managedFields/0" },
    ]);
  });

  test("issues remove patch at the correct index when Pepr entry is non-zero", async () => {
    const managedFields: V1ManagedFieldsEntry[] = [
      { manager: "helm", operation: "Apply", fieldsV1: {} },
      { manager: "zarf", operation: "Apply", fieldsV1: {} },
      { manager: PEPR_FIELD_MANAGER, operation: "Apply", fieldsV1: {} },
    ];
    await removePeprManagedFieldsEntry(
      kind.Namespace,
      "test-ns",
      undefined,
      managedFields,
      mockLog,
    );
    expect(mockPatch).toHaveBeenCalledWith([
      { op: "test", path: "/metadata/managedFields/2/manager", value: PEPR_FIELD_MANAGER },
      { op: "test", path: "/metadata/managedFields/2/operation", value: "Apply" },
      { op: "remove", path: "/metadata/managedFields/2" },
    ]);
  });

  test("skips Update entries and targets only the Apply entry", async () => {
    const managedFields: V1ManagedFieldsEntry[] = [
      { manager: PEPR_FIELD_MANAGER, operation: "Update", fieldsV1: {} },
      { manager: PEPR_FIELD_MANAGER, operation: "Apply", fieldsV1: {} },
    ];
    await removePeprManagedFieldsEntry(
      kind.Namespace,
      "test-ns",
      undefined,
      managedFields,
      mockLog,
    );
    expect(mockPatch).toHaveBeenCalledWith([
      { op: "test", path: "/metadata/managedFields/1/manager", value: PEPR_FIELD_MANAGER },
      { op: "test", path: "/metadata/managedFields/1/operation", value: "Apply" },
      { op: "remove", path: "/metadata/managedFields/1" },
    ]);
  });

  test("logs warning and continues when patch fails (index race)", async () => {
    mockPatch.mockRejectedValueOnce(new Error("test op failed"));
    const managedFields: V1ManagedFieldsEntry[] = [
      { manager: PEPR_FIELD_MANAGER, operation: "Apply", fieldsV1: {} },
    ];
    await expect(
      removePeprManagedFieldsEntry(kind.Namespace, "test-ns", undefined, managedFields, mockLog),
    ).resolves.toBeUndefined();
    expect(mockLog.warn).toHaveBeenCalled();
  });
});
