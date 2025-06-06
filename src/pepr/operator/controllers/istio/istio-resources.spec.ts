/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { kind } from "pepr";
import { Direction, RemoteGenerated, RemoteProtocol } from "../../crd";
import { purgeOrphans } from "../utils";
import { defaultEgressMocks, pkgMock, updateEgressMocks } from "./defaultTestMocks";
import { istioEgressResources } from "./istio-resources";
import { reconcileSharedEgressResources } from "./egress";

const mockPurgeOrphans: jest.MockedFunction<() => Promise<void>> = jest.fn();
const mockReconcileSharedEgressResources = jest.fn();

// Mock the necessary functions
jest.mock("pepr", () => ({
  K8s: jest.fn(),
  Log: {
    child: jest.fn(() => ({
      info: jest.fn(),
      debug: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      level: "info",
    })),
  },
  kind: {
    Gateway: "Gateway",
    VirtualService: "VirtualService",
    ServiceEntry: "ServiceEntry",
    Sidecar: "Sidecar",
    Namespace: "Namespace",
    Service: "Service",
  },
}));
jest.mock("../utils", () => {
  const originalModule = jest.requireActual("../utils");
  return {
    ...(typeof originalModule === "object" ? originalModule : {}),
    purgeOrphans: jest.fn(async <T>(fn: () => Promise<T>) => fn()),
  };
});
jest.mock("./egress", () => {
  const originalModule = jest.requireActual("./egress");
  return {
    ...(typeof originalModule === "object" ? originalModule : {}),
    reconcileSharedEgressResources: jest.fn(),
  };
});

describe("test istioEgressResources", () => {
  const pkgIdMock = "test-package-test-namespace";

  beforeEach(() => {
    process.env.PEPR_WATCH_MODE = "true";
    jest.useFakeTimers();

    (purgeOrphans as jest.Mock).mockImplementation(mockPurgeOrphans);
    (reconcileSharedEgressResources as jest.Mock).mockImplementation(
      mockReconcileSharedEgressResources,
    );
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it("should err if no egress gateway namespace with defined hostResourceMap", async () => {
    const mockHostResourceMap = {
      "example.com": {
        portProtocol: [{ port: 443, protocol: RemoteProtocol.TLS }],
      },
    };

    const errorMessage =
      "Unable to reconcile get the egress gateway namespace istio-egress-gateway.";

    const getNsMock = jest
      .fn<() => Promise<kind.Namespace>>()
      .mockRejectedValue(new Error(errorMessage));

    updateEgressMocks({
      ...defaultEgressMocks,
      getNsMock,
    });

    await expect(
      istioEgressResources(
        mockHostResourceMap,
        [],
        pkgIdMock,
        pkgMock.metadata!.name!,
        pkgMock.metadata!.namespace!,
        pkgMock.metadata!.generation!.toString(),
        [],
      ),
    ).rejects.toThrow(errorMessage);
  });

  it("should err if no egress gateway port with defined hostResourceMap", async () => {
    const mockError = new Error(
      "Egress gateway does not expose port 1234 for host example.com. Please update the egress gateway service to expose this port.",
    );

    const mockHostResourceMap = {
      "example.com": {
        portProtocol: [{ port: 1234, protocol: RemoteProtocol.TLS }],
      },
    };

    updateEgressMocks(defaultEgressMocks);

    await expect(
      istioEgressResources(
        mockHostResourceMap,
        [],
        pkgIdMock,
        pkgMock.metadata!.name!,
        pkgMock.metadata!.namespace!,
        pkgMock.metadata!.generation!.toString(),
        [],
      ),
    ).rejects.toThrowError(mockError);
  });

  it("should pass for undefined hostResourceMap", async () => {
    await istioEgressResources(
      undefined,
      [],
      pkgIdMock,
      pkgMock.metadata!.name!,
      pkgMock.metadata!.namespace!,
      pkgMock.metadata!.generation!.toString(),
      [],
    );

    expect(mockReconcileSharedEgressResources).toHaveBeenCalledTimes(1);
  });

  it("should create egress resources", async () => {
    const mockHostResourceMap = {
      "example.com": {
        portProtocol: [
          { port: 443, protocol: RemoteProtocol.TLS },
          { port: 80, protocol: RemoteProtocol.HTTP },
        ],
      },
    };

    const mockApply = [
      {
        remoteHost: "example.com",
        port: 443,
        remoteProtocol: RemoteProtocol.TLS,
        direction: Direction.Egress,
        selector: {
          app: "example-app1",
        },
      },
      {
        remoteHost: "example.com",
        port: 80,
        remoteProtocol: RemoteProtocol.TLS,
        direction: Direction.Egress,
        selector: {
          app: "example-app2",
        },
      },
    ];

    updateEgressMocks(defaultEgressMocks);

    await istioEgressResources(
      mockHostResourceMap,
      mockApply,
      pkgIdMock,
      pkgMock.metadata!.name!,
      pkgMock.metadata!.namespace!,
      pkgMock.metadata!.generation!.toString(),
      [],
    );

    expect(defaultEgressMocks.applySeMock).toHaveBeenCalledTimes(1);
    expect(defaultEgressMocks.applySidecarMock).toHaveBeenCalledTimes(2);
  });

  it("should not create egress resources", async () => {
    updateEgressMocks(defaultEgressMocks);

    await istioEgressResources(
      undefined,
      [
        {
          direction: Direction.Ingress,
          selector: {
            app: "my-app",
          },
          port: 80,
          remoteGenerated: RemoteGenerated.Anywhere,
        },
      ],
      pkgIdMock,
      pkgMock.metadata!.name!,
      pkgMock.metadata!.namespace!,
      pkgMock.metadata!.generation!.toString(),
      [],
    );

    expect(defaultEgressMocks.applySeMock).not.toHaveBeenCalled();
    expect(defaultEgressMocks.applySidecarMock).not.toHaveBeenCalled();
  });
});
