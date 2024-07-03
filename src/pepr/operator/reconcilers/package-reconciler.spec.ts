import { beforeEach, describe, expect, jest, test } from "@jest/globals";

import { K8s, Log } from "pepr";
import { Phase, UDSPackage } from "../crd";
import { packageReconciler } from "./package-reconciler";

jest.mock("kubernetes-fluent-client");
jest.mock("../../config");
jest.mock("../controllers/istio/injection");
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
