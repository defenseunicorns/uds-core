import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { GenericKind } from "kubernetes-fluent-client";
import { K8s, Log, kind } from "pepr";

import { Mock } from "jest-mock";
import { handleFailure, shouldSkip, updateStatus, writeEvent } from ".";
import { ExemptStatus, Phase, PkgStatus, UDSExemption, UDSPackage } from "../crd";

jest.mock("pepr", () => ({
  K8s: jest.fn(),
  Log: {
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
  kind: {
    CoreEvent: "CoreEvent",
  },
}));

describe("isPendingOrCurrent", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    (K8s as jest.Mock).mockImplementation(() => ({
      Create: jest.fn(),
    }));
  });

  it("should return false for a new CR", () => {
    const cr = { metadata: { uid: "1" }, status: { phase: Phase.Pending } } as UDSPackage;
    expect(shouldSkip(cr)).toBe(false);
  });

  it("should return true for a pending CR on subsequent calls", () => {
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
    jest.clearAllMocks();

    PatchStatus = jest.fn();

    (K8s as jest.Mock).mockImplementation(() => ({
      Create: jest.fn(),
      PatchStatus,
    }));
  });

  it("should update the status of a package", async () => {
    const cr = { kind: "Package", metadata: { name: "test", namespace: "default" } };
    const status = { phase: Phase.Ready };
    await updateStatus(cr as GenericKind, status as PkgStatus);
    expect(K8s).toHaveBeenCalledWith(UDSPackage);
    expect(PatchStatus).toHaveBeenCalledWith({
      metadata: { name: "test", namespace: "default" },
      status,
    });
  });

  it("should update the status of an exemption", async () => {
    const cr = { kind: "Exemption", metadata: { name: "test", namespace: "default" } };
    const status = { phase: Phase.Ready };
    await updateStatus(cr as GenericKind, status as ExemptStatus);
    expect(K8s).toHaveBeenCalledWith(UDSExemption);
    expect(PatchStatus).toHaveBeenCalledWith({
      metadata: { name: "test", namespace: "default" },
      status,
    });
  });
});

describe("writeEvent", () => {
  let Create: Mock;
  beforeEach(() => {
    jest.clearAllMocks();

    Create = jest.fn();

    (K8s as jest.Mock).mockImplementation(() => ({
      Create,
      PatchStatus: jest.fn(),
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
    jest.clearAllMocks();

    Create = jest.fn();
    PatchStatus = jest.fn();

    (K8s as jest.Mock).mockImplementation(() => ({
      Create,
      PatchStatus,
    }));
  });

  it("should handle a 404 error", async () => {
    const err = { status: 404, message: "Not found" };
    const cr = { metadata: { namespace: "default", name: "test" } };
    await handleFailure(err, cr as UDSPackage | UDSExemption);
    expect(Log.warn).toHaveBeenCalledWith({ err }, "Package metadata seems to have been deleted");
    expect(Create).not.toHaveBeenCalled();
  });

  it("should handle a failure", async () => {
    const err = { status: 500, message: "Internal server error" };
    const cr = {
      kind: "Package",
      apiVersion: "v1",
      metadata: { namespace: "default", name: "test", generation: 1, uid: "1" },
    };
    await handleFailure(err, cr as UDSPackage | UDSExemption);
    expect(Log.error).toHaveBeenCalledWith({ err }, "Error configuring default/test");

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
      },
    });
  });
});
