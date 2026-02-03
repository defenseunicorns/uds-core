/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { GenericKind } from "kubernetes-fluent-client";
import { K8s, kind, Log } from "pepr";
import { beforeEach, describe, expect, it, Mock, vi } from "vitest";
import { StatusEnum } from "../crd/generated/package-v1alpha1.js";
import { Phase, PkgStatus, UDSPackage } from "../crd/index.js";
import { handleFailure, shouldSkip, uidSeen, updateStatus, writeEvent } from "./index.js";

vi.mock("pepr", () => ({
  K8s: vi.fn(),
  Log: {
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    trace: vi.fn(),
    child: vi.fn().mockReturnThis(),
  },
  kind: {
    CoreEvent: "CoreEvent",
  },
}));

describe("isPendingOrCurrent", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    (K8s as Mock).mockImplementation(() => ({
      Create: vi.fn(),
    }));
  });

  it("should return false for a new CR", () => {
    const cr = { metadata: { uid: "1" }, status: { phase: Phase.Pending } } as UDSPackage;
    expect(shouldSkip(cr)).toBe(false);
  });

  it("should return true for a pending CR on subsequent calls", () => {
    uidSeen.add("1");
    const cr = { metadata: { uid: "1" }, status: { phase: Phase.Pending } } as UDSPackage;
    expect(shouldSkip(cr)).toBe(true);
  });

  it("should return true for a CR with current generation on subsequent calls", () => {
    const cr = {
      metadata: { uid: "1", generation: 1 },
      status: { observedGeneration: 1 },
    } as UDSPackage;
    expect(shouldSkip(cr)).toBe(true);
  });

  it("should return false for a CR with different generation on subsequent calls", () => {
    const cr = {
      metadata: { uid: "1", generation: 2 },
      status: { observedGeneration: 1 },
    } as UDSPackage;
    expect(shouldSkip(cr)).toBe(false);
  });
});

describe("updateStatus", () => {
  let PatchStatus: Mock;
  beforeEach(() => {
    vi.clearAllMocks();

    PatchStatus = vi.fn();

    (K8s as Mock).mockImplementation(() => ({
      Create: vi.fn(),
      PatchStatus,
    }));
  });

  it("should update the status of a package", async () => {
    const cr = { kind: "Package", metadata: { name: "test", namespace: "default" } };
    const status = {
      phase: Phase.Ready,
      conditions: [
        {
          type: "Ready",
          status: StatusEnum.True,
          lastTransitionTime: new Date(),
          message: "The package is ready for use.",
          reason: "ReconciliationComplete",
        },
      ],
    };
    await updateStatus(cr as GenericKind, status as PkgStatus);
    expect(K8s).toHaveBeenCalledWith(UDSPackage);
    expect(PatchStatus).toHaveBeenCalledWith({
      metadata: { name: "test", namespace: "default" },
      status,
    });
  });

  it("should normalize legacy string-list authserviceClients and populate selector from spec.sso", async () => {
    const cr = {
      kind: "Package",
      metadata: { name: "test", namespace: "default", uid: "123" },
      spec: {
        sso: [
          { clientId: "client-a", enableAuthserviceSelector: { app: "a" } },
          { clientId: "client-b", enableAuthserviceSelector: { app: "b" } },
        ],
      },
      status: {
        // Simulate legacy format persisted in cluster
        authserviceClients: ["client-a", "client-b"],
      },
    } as unknown as UDSPackage;

    const status: PkgStatus = {
      phase: Phase.Pending,
      conditions: [
        {
          type: "Ready",
          status: StatusEnum.False,
          lastTransitionTime: new Date(),
          message: "The package is not ready for use.",
          reason: "ReconciliationComplete",
        },
      ],
    };

    await updateStatus(cr, status);

    // Ensure PatchStatus is called with normalized authserviceClients objects and selectors from spec
    expect(PatchStatus).toHaveBeenCalledWith({
      metadata: { name: "test", namespace: "default" },
      status: {
        ...status,
        authserviceClients: [
          { clientId: "client-a", selector: { app: "a" } },
          { clientId: "client-b", selector: { app: "b" } },
        ],
      },
    });
  });
});

describe("writeEvent", () => {
  let Create: Mock;
  beforeEach(() => {
    vi.clearAllMocks();

    Create = vi.fn();

    (K8s as Mock).mockImplementation(() => ({
      Create,
      PatchStatus: vi.fn(),
    }));
  });

  it("should write a K8s event for the CRD", async () => {
    const cr = {
      apiVersion: "v1",
      kind: "Package",
      metadata: { name: "test", namespace: "default", uid: "1" },
    };
    const event = { message: "Test event" };
    await writeEvent(cr as GenericKind, event);
    expect(K8s).toHaveBeenCalledWith(kind.CoreEvent);
    expect(Create).toHaveBeenCalledWith({
      ...event,
      type: "Warning",
      reason: "ReconciliationFailed",
      metadata: { namespace: "default", generateName: "test" },
      involvedObject: {
        apiVersion: "v1",
        kind: "Package",
        name: "test",
        namespace: "default",
        uid: "1",
      },
      firstTimestamp: expect.any(Date),
      reportingComponent: "uds.dev/operator",
      reportingInstance: process.env.HOSTNAME,
    });
  });
});

describe("handleFailure", () => {
  let Create: Mock;
  let PatchStatus: Mock;
  beforeEach(() => {
    vi.clearAllMocks();

    Create = vi.fn();
    PatchStatus = vi.fn();

    (K8s as Mock).mockImplementation(() => ({
      Create,
      PatchStatus,
    }));
  });

  it("should handle a 404 error", async () => {
    const err = { status: 404, message: "Not found" };
    const cr = { metadata: { namespace: "default", name: "test" } };
    await handleFailure(err, cr as UDSPackage);
    expect(Log.warn).toHaveBeenCalledWith({ err }, "Package metadata seems to have been deleted");
    expect(Create).not.toHaveBeenCalled();
  });

  it("should retry a failure", async () => {
    const err = { status: 500, message: "Internal server error" };
    const cr = {
      kind: "Package",
      apiVersion: "v1",
      metadata: { namespace: "default", name: "test", generation: 1, uid: "1" },
    };
    await handleFailure(err, cr as UDSPackage);
    expect(Log.error).toHaveBeenCalledWith(
      { err },
      "Reconciliation attempt 1 failed for default/test, retrying...",
    );

    expect(Create).toHaveBeenCalledWith({
      type: "Warning",
      reason: "ReconciliationFailed",
      message: "Internal server error",
      metadata: {
        namespace: cr.metadata!.namespace,
        generateName: cr.metadata!.name,
      },
      involvedObject: {
        apiVersion: cr.apiVersion,
        kind: cr.kind,
        name: cr.metadata!.name,
        namespace: cr.metadata!.namespace,
        uid: cr.metadata!.uid,
      },
      firstTimestamp: expect.any(Date),
      reportingComponent: "uds.dev/operator",
      reportingInstance: process.env.HOSTNAME,
    });

    expect(PatchStatus).toHaveBeenCalledWith({
      metadata: { namespace: "default", name: "test" },
      status: {
        phase: Phase.Retrying,
        conditions: [
          {
            type: "Ready",
            status: StatusEnum.False,
            lastTransitionTime: expect.any(Date),
            message: "The package is not ready for use.",
            reason: "ReconciliationComplete",
          },
        ],
        retryAttempt: 1,
      },
    });
  });

  it("should fail after 5 retries", async () => {
    const err = { status: 500, message: "Internal server error" };
    const cr = {
      kind: "Package",
      apiVersion: "v1",
      metadata: { namespace: "default", name: "test", generation: 1, uid: "1" },
      status: {
        phase: Phase.Pending,
        conditions: [
          {
            type: "Ready",
            status: StatusEnum.False,
            lastTransitionTime: new Date(),
            message: "The package is not ready for use.",
            reason: "ReconciliationComplete",
          },
        ],
        retryAttempt: 5,
      },
    };
    await handleFailure(err, cr as UDSPackage);
    expect(Log.error).toHaveBeenCalledWith(
      { err },
      "Error configuring default/test, maxed out retries",
    );

    expect(Create).toHaveBeenCalledWith({
      type: "Warning",
      reason: "ReconciliationFailed",
      message: "Internal server error",
      metadata: {
        namespace: cr.metadata!.namespace,
        generateName: cr.metadata!.name,
      },
      involvedObject: {
        apiVersion: cr.apiVersion,
        kind: cr.kind,
        name: cr.metadata!.name,
        namespace: cr.metadata!.namespace,
        uid: cr.metadata!.uid,
      },
      firstTimestamp: expect.any(Date),
      reportingComponent: "uds.dev/operator",
      reportingInstance: process.env.HOSTNAME,
    });

    expect(PatchStatus).toHaveBeenCalledWith({
      metadata: { namespace: "default", name: "test" },
      status: {
        observedGeneration: 1,
        phase: Phase.Failed,
        conditions: [
          {
            type: "Ready",
            status: StatusEnum.False,
            lastTransitionTime: expect.any(Date),
            message: "The package is not ready for use.",
            reason: "ReconciliationComplete",
          },
        ],
        retryAttempt: 0,
      },
    });
  });
});
