/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { beforeEach, describe, expect, jest, test } from "@jest/globals";

import { K8s, Log } from "pepr";
import { writeEvent } from ".";
import { cleanupNamespace } from "../controllers/istio/injection";
import { purgeAuthserviceClients } from "../controllers/keycloak/authservice/authservice";
import { purgeSSOClients } from "../controllers/keycloak/client-sync";
import { retryWithDelay } from "../controllers/utils";
import { Phase, UDSPackage } from "../crd";
import { packageFinalizer, packageReconciler } from "./package-reconciler";

const mockCleanupNamespace: jest.MockedFunction<() => Promise<void>> = jest.fn();
const mockPurgeSSO: jest.MockedFunction<() => Promise<void>> = jest.fn();
const mockPurgeAuthservice: jest.MockedFunction<() => Promise<void>> = jest.fn();
const mockPatchStatus: jest.MockedFunction<() => Promise<void>> = jest.fn();
const mockWriteEvent = jest.fn();

jest.mock("kubernetes-fluent-client");
jest.mock("../../config");
jest.mock("../controllers/istio/injection", () => ({
  cleanupNamespace: jest.fn(),
}));
jest.mock("../controllers/keycloak/client-sync", () => ({
  purgeSSOClients: jest.fn(),
}));
jest.mock("../controllers/keycloak/authservice/authservice", () => ({
  purgeAuthserviceClients: jest.fn(),
}));
jest.mock("../controllers/utils", () => ({
  retryWithDelay: jest.fn(async <T>(fn: () => Promise<T>) => fn()),
}));
jest.mock(".", () => {
  const originalModule = jest.requireActual(".") as object;
  return {
    ...originalModule,
    writeEvent: jest.fn(),
  };
});

jest.mock("../controllers/istio/virtual-service");
jest.mock("../controllers/network/policies");

jest.mock("pepr", () => ({
  K8s: jest.fn(),
  Log: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    trace: jest.fn(),
    child: jest.fn().mockReturnThis(),
  },
  kind: {
    CoreEvent: "CoreEvent",
  },
  Capability: jest.fn().mockImplementation(() => {
    return {
      name: "uds-core-operator",
      description: "The UDS Operator is responsible for managing the lifecycle of UDS resources",
    };
  }),
}));

describe("reconciler", () => {
  let mockPackage: UDSPackage;

  beforeEach(() => {
    jest.clearAllMocks();

    mockPackage = {
      metadata: { name: "test-package", namespace: "test-namespace", generation: 1 },
      status: { phase: Phase.Pending, observedGeneration: 0 },
    };

    (K8s as jest.Mock).mockImplementation(() => ({
      Create: jest.fn(),
      PatchStatus: jest.fn(),
    }));
  });

  test("should log an error for invalid package definitions", async () => {
    delete mockPackage.metadata!.namespace;
    await packageReconciler(mockPackage);
    expect(Log.error).toHaveBeenCalled();
  });
});

describe("finalizer", () => {
  let mockPackage: UDSPackage;

  beforeEach(() => {
    jest.clearAllMocks();

    mockPackage = {
      metadata: { name: "test-package", namespace: "test-namespace", generation: 1 },
    };

    (K8s as jest.Mock).mockImplementation(() => ({
      Create: jest.fn(),
      PatchStatus: mockPatchStatus,
    }));
    (cleanupNamespace as jest.Mock).mockImplementation(mockCleanupNamespace);
    (purgeSSOClients as jest.Mock).mockImplementation(mockPurgeSSO);
    (purgeAuthserviceClients as jest.Mock).mockImplementation(mockPurgeAuthservice);
    (writeEvent as jest.Mock).mockImplementation(mockWriteEvent);
  });

  test("should not remove the finalizer for pending packages", async () => {
    mockPackage.status = { phase: Phase.Pending };
    const finalizerRemoved = await packageFinalizer(mockPackage);
    // Assert that we didn't try to cleanup anything
    expect(retryWithDelay).not.toHaveBeenCalled();
    expect(mockCleanupNamespace).not.toHaveBeenCalled();
    expect(mockPurgeSSO).not.toHaveBeenCalled();
    expect(mockPurgeAuthservice).not.toHaveBeenCalled();
    // Assert that the finalizer was not removed
    expect(finalizerRemoved).toEqual(false);
  });

  test("should not remove the finalizer for removing packages", async () => {
    mockPackage.status = { phase: Phase.Removing };
    const finalizerRemoved = await packageFinalizer(mockPackage);
    // Assert that we didn't try to cleanup anything
    expect(retryWithDelay).not.toHaveBeenCalled();
    expect(mockCleanupNamespace).not.toHaveBeenCalled();
    expect(mockPurgeSSO).not.toHaveBeenCalled();
    expect(mockPurgeAuthservice).not.toHaveBeenCalled();
    // Assert that the finalizer was not removed
    expect(finalizerRemoved).toEqual(false);
  });

  test("should not remove the finalizer for removalfailed packages", async () => {
    mockPackage.status = { phase: Phase.RemovalFailed };
    const finalizerRemoved = await packageFinalizer(mockPackage);
    // Assert that we didn't try to cleanup anything
    expect(retryWithDelay).not.toHaveBeenCalled();
    expect(mockCleanupNamespace).not.toHaveBeenCalled();
    expect(mockPurgeSSO).not.toHaveBeenCalled();
    expect(mockPurgeAuthservice).not.toHaveBeenCalled();
    // Assert that the finalizer was not removed
    expect(finalizerRemoved).toEqual(false);
  });

  test("should finalize a ready package", async () => {
    mockPackage.status = { phase: Phase.Ready };
    const finalizerRemoved = await packageFinalizer(mockPackage);
    expect(finalizerRemoved).toEqual(true);
    expect(retryWithDelay).toHaveBeenCalled();
    expect(mockCleanupNamespace).toHaveBeenCalled();
    expect(mockPurgeSSO).toHaveBeenCalled();
    expect(mockPurgeAuthservice).toHaveBeenCalled();
  });

  test("should handle failure in cleanupNamespace and set phase to RemovalFailed", async () => {
    mockPackage.status = { phase: Phase.Ready };
    mockCleanupNamespace.mockRejectedValue(new Error("Istio cleanup failed"));
    mockPurgeAuthservice.mockReset();
    mockPurgeSSO.mockReset();

    const finalizerRemoved = await packageFinalizer(mockPackage);

    expect(finalizerRemoved).toEqual(false);
    expect(retryWithDelay).toHaveBeenCalled();
    expect(mockCleanupNamespace).toHaveBeenCalled();
    expect(mockPatchStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: { name: "test-package", namespace: "test-namespace" },
        status: { phase: Phase.RemovalFailed },
      }),
    );
    expect(mockWriteEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        reason: "RemovalFailed",
        message: expect.stringContaining("Istio"),
      }),
    );
  });

  test("should handle failure in purgeAuthserviceClients and set phase to RemovalFailed", async () => {
    mockPackage.status = { phase: Phase.Ready };
    mockCleanupNamespace.mockReset();
    mockPurgeAuthservice.mockRejectedValue(new Error("AuthService cleanup failed"));
    mockPurgeSSO.mockReset();

    const finalizerRemoved = await packageFinalizer(mockPackage);

    expect(finalizerRemoved).toEqual(false);
    expect(retryWithDelay).toHaveBeenCalled();
    expect(mockCleanupNamespace).toHaveBeenCalled();
    expect(mockPurgeAuthservice).toHaveBeenCalled();
    expect(mockPatchStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: { name: "test-package", namespace: "test-namespace" },
        status: { phase: Phase.RemovalFailed },
      }),
    );
    expect(mockWriteEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        reason: "RemovalFailed",
        message: expect.stringContaining("AuthService"),
      }),
    );
  });

  test("should handle failure in purgeSSOClients and set phase to RemovalFailed", async () => {
    mockPackage.status = { phase: Phase.Ready };
    mockCleanupNamespace.mockReset();
    mockPurgeAuthservice.mockReset();
    mockPurgeSSO.mockRejectedValue(new Error("SSO cleanup failed"));

    const finalizerRemoved = await packageFinalizer(mockPackage);

    expect(finalizerRemoved).toEqual(false);
    expect(retryWithDelay).toHaveBeenCalled();
    expect(mockCleanupNamespace).toHaveBeenCalled();
    expect(mockPurgeAuthservice).toHaveBeenCalled();
    expect(mockPurgeSSO).toHaveBeenCalled();
    expect(mockPatchStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: { name: "test-package", namespace: "test-namespace" },
        status: { phase: Phase.RemovalFailed },
      }),
    );
    expect(mockWriteEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        reason: "RemovalFailed",
        message: expect.stringContaining("SSO"),
      }),
    );
  });
});
