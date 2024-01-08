import { beforeEach, describe, expect, jest, test } from "@jest/globals";

import { K8s, Log } from "pepr";
import { Phase, UDSPackage } from "./crd";
import { reconciler } from "./reconciler";

jest.mock("kubernetes-fluent-client");
jest.mock("pepr");
jest.mock("../config");
jest.mock("./controllers/istio/injection");
jest.mock("./controllers/istio/virtual-service");
jest.mock("./controllers/network/policies");

describe("reconciler", () => {
  let mockPackage: UDSPackage;

  beforeEach(() => {
    jest.clearAllMocks();

    mockPackage = {
      metadata: { name: "test-package", namespace: "test-namespace", generation: 1 },
      status: { phase: Phase.Pending, observedGeneration: 0 },
    };

    (K8s as jest.Mock).mockImplementation(() => ({
      PatchStatus: jest.fn(),
    }));
  });

  test("should log an error for invalid package definitions", async () => {
    delete mockPackage.metadata!.namespace;
    await reconciler(mockPackage);
    expect(Log.error).toHaveBeenCalled();
  });

  test("should skip processing for pending or completed packages", async () => {
    mockPackage.status!.phase = Phase.Pending;
    await reconciler(mockPackage);
    expect(Log.debug).toHaveBeenCalledWith(
      expect.anything(),
      "Skipping pending or completed package",
    );

    mockPackage.status!.phase = Phase.Ready;
    mockPackage.status!.observedGeneration = mockPackage.metadata!.generation;
    await reconciler(mockPackage);
    expect(Log.debug).toHaveBeenCalledWith(
      expect.anything(),
      "Skipping pending or completed package",
    );
  });
});
