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

const mockPurgeOrphans: jest.MockedFunction<() => Promise<void>> = jest.fn();

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
    Namespace: "Namespace",
  },
}));
jest.mock("../utils", () => {
  const originalModule = jest.requireActual("../utils");
  return {
    ...(typeof originalModule === "object" ? originalModule : {}),
    purgeOrphans: jest.fn(async <T>(fn: () => Promise<T>) => fn()),
  };
});

describe("test istioEgressResources", () => {
  const pkgIdMock = "test-package-test-namespace";

  beforeEach(() => {
    process.env.PEPR_WATCH_MODE = "true";
    jest.useFakeTimers();

    (purgeOrphans as jest.Mock).mockImplementation(mockPurgeOrphans);
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it("should err if no egress gateway namespace", async () => {
    const errorMessage = "Namespace not found";
    const getNsMock = jest
      .fn<() => Promise<kind.Namespace>>()
      .mockRejectedValue(new Error(errorMessage));

    updateEgressMocks({
      ...defaultEgressMocks,
      getNsMock,
    });

    await expect(
      istioEgressResources(
        undefined,
        [],
        pkgIdMock,
        pkgMock.metadata!.name!,
        pkgMock.metadata!.namespace!,
        pkgMock.metadata!.generation!.toString(),
        [],
      ),
    ).rejects.toThrow(errorMessage);
  });

  it("should err if no egress gateway port", async () => {
    const mockError = new Error(
      "Egress gateway does not expose port 1234 for host example.com. Please update the egress gateway service to expose this port.",
    );
    const mockHostResourceMap = {
      "example.com": {
        portProtocol: [{ port: 1234, protocol: RemoteProtocol.TLS }],
      },
    };

    const getServiceMock = jest.fn<() => Promise<kind.Service>>().mockResolvedValue({
      metadata: {
        name: "egressgateway",
        namespace: "istio-egress-gateway",
      },
      spec: {
        ports: [{ port: 80 }, { port: 443 }],
      },
    });

    const getServiceInNamespaceMock = jest.fn().mockReturnValue({ Get: getServiceMock });

    updateEgressMocks({
      ...defaultEgressMocks,
      getServiceInNsMock: getServiceInNamespaceMock, // Match the property name expected in implementation
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
    ).rejects.toThrowError(mockError);
  });

  it("should create egress resources", async () => {
    updateEgressMocks(defaultEgressMocks);

    await istioEgressResources(
      {
        "example.com": {
          portProtocol: [
            { port: 443, protocol: RemoteProtocol.TLS },
            { port: 80, protocol: RemoteProtocol.HTTP },
          ],
        },
      },
      [
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
      ],
      pkgIdMock,
      pkgMock.metadata!.name!,
      pkgMock.metadata!.namespace!,
      pkgMock.metadata!.generation!.toString(),
      [],
    );

    expect(defaultEgressMocks.applySeMock).toHaveBeenCalledTimes(2); // in package namespace and egress gateway namespace
    expect(defaultEgressMocks.applySidecarMock).toHaveBeenCalledTimes(2); // once for each selector
    expect(defaultEgressMocks.applyGwMock).toHaveBeenCalledTimes(1);
    expect(defaultEgressMocks.applyVsMock).toHaveBeenCalledTimes(1);
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
    expect(defaultEgressMocks.applyGwMock).not.toHaveBeenCalled();
    expect(defaultEgressMocks.applyVsMock).not.toHaveBeenCalled();
  });
});
