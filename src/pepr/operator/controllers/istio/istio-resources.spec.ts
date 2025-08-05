/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { kind } from "pepr";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Direction, RemoteGenerated, RemoteProtocol } from "../../crd";
import * as utils from "../utils";
import { defaultEgressMocks, pkgMock, updateEgressMocks } from "./defaultTestMocks";
import * as egressMod from "./egress";
import * as egressAmbientMod from "./egress-ambient";
import { istioEgressResources } from "./istio-resources";
import { IstioState } from "./namespace";

vi.mock("../utils", async importOriginal => {
  const original = (await importOriginal()) as typeof utils;
  return {
    ...original,
    purgeOrphans: vi.fn(async <T>(fn?: () => Promise<T>) => {
      if (typeof fn === "function") {
        return await fn();
      }
      return;
    }),
  };
});

vi.mock("pepr", () => ({
  K8s: vi.fn(),
  Log: {
    child: vi.fn(() => ({
      info: vi.fn(),
      debug: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
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

describe("test istioEgressResources", () => {
  const pkgIdMock = "test-package-test-namespace";

  beforeEach(() => {
    process.env.PEPR_WATCH_MODE = "true";
    vi.useFakeTimers();

    vi.spyOn(egressMod, "reconcileSharedEgressResources").mockImplementation(async () => {});
    vi.spyOn(egressAmbientMod, "createAmbientWorkloadEgressResources").mockImplementation(
      async () => {},
    );
    updateEgressMocks(defaultEgressMocks);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it("should err if no egress gateway namespace with defined hostResourceMap for sidecar mode", async () => {
    const mockHostResourceMap = {
      "example.com": {
        portProtocol: [{ port: 443, protocol: RemoteProtocol.TLS }],
      },
    };

    const errorMessage = "Unable to get the egress gateway namespace istio-egress-gateway.";

    const getNsMock = vi
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
        IstioState.Sidecar,
      ),
    ).rejects.toThrow(errorMessage);
  });

  it("should err if no egress gateway port with defined hostResourceMap for sidecar mode", async () => {
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
        IstioState.Sidecar,
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
      IstioState.Sidecar,
    );

    expect(egressMod.reconcileSharedEgressResources).toHaveBeenCalledTimes(1);
  });

  it("should create egress resources for sidecar mode", async () => {
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
      IstioState.Sidecar,
    );

    expect(defaultEgressMocks.applySeMock).toHaveBeenCalledTimes(1);
    expect(defaultEgressMocks.applySidecarMock).toHaveBeenCalledTimes(2);
  });

  it("should not create egress resources for sidecar mode", async () => {
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
      IstioState.Sidecar,
    );

    expect(defaultEgressMocks.applySeMock).not.toHaveBeenCalled();
    expect(defaultEgressMocks.applySidecarMock).not.toHaveBeenCalled();
  });

  it("should err if no egress waypoint namespace for ambient mode", async () => {
    const mockHostResourceMap = {
      "example.com": {
        portProtocol: [{ port: 443, protocol: RemoteProtocol.TLS }],
      },
    };

    const errorMessage = "Unable to get the egress waypoint namespace istio-egress-waypoint.";

    const validateNamespaceMock = vi
      .spyOn(utils, "validateNamespace")
      .mockRejectedValue(new Error(errorMessage));

    await expect(
      istioEgressResources(
        mockHostResourceMap,
        [],
        pkgIdMock,
        pkgMock.metadata!.name!,
        pkgMock.metadata!.namespace!,
        pkgMock.metadata!.generation!.toString(),
        [],
        IstioState.Ambient,
      ),
    ).rejects.toThrow(errorMessage);

    expect(validateNamespaceMock).toHaveBeenCalledWith("istio-egress-waypoint");
    expect(egressAmbientMod.createAmbientWorkloadEgressResources).not.toHaveBeenCalled();
  });

  it("should create ambient workload egress resources for ambient mode", async () => {
    const mockHostResourceMap = {
      "example.com": {
        portProtocol: [
          { port: 443, protocol: RemoteProtocol.TLS },
          { port: 80, protocol: RemoteProtocol.HTTP },
        ],
      },
    };

    const mockAllowList = [
      {
        remoteHost: "example.com",
        port: 443,
        remoteProtocol: RemoteProtocol.TLS,
        direction: Direction.Egress,
        selector: {
          app: "example-app1",
        },
      },
    ];

    const validateNamespaceMock = vi
      .spyOn(utils, "validateNamespace")
      .mockResolvedValue({} as kind.Namespace);

    await istioEgressResources(
      mockHostResourceMap,
      mockAllowList,
      pkgIdMock,
      pkgMock.metadata!.name!,
      pkgMock.metadata!.namespace!,
      pkgMock.metadata!.generation!.toString(),
      [],
      IstioState.Ambient,
    );

    expect(validateNamespaceMock).toHaveBeenCalledWith("istio-egress-waypoint");
    expect(egressAmbientMod.createAmbientWorkloadEgressResources).toHaveBeenCalledWith(
      mockHostResourceMap,
      mockAllowList,
      pkgMock.metadata!.name!,
      pkgMock.metadata!.namespace!,
      pkgMock.metadata!.generation!.toString(),
      [],
    );
  });
});
