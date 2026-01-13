/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { kind } from "pepr";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Direction, RemoteGenerated, RemoteProtocol } from "../../crd";
import { Mode } from "../../crd/generated/package-v1alpha1";
import * as utils from "../utils";
import { defaultEgressMocks, pkgMock, updateEgressMocks } from "./defaultTestMocks";
import * as egressMod from "./egress";
import { istioEgressResources } from "./egress-orchestrator";

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
  beforeEach(() => {
    process.env.PEPR_WATCH_MODE = "true";
    vi.useFakeTimers();

    vi.spyOn(egressMod, "reconcileSharedEgressResources").mockImplementation(async () => {});
    updateEgressMocks(defaultEgressMocks);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  // Verifies sidecar mode errors when the egress gateway namespace is missing
  it("should err if no egress gateway namespace with defined hostResourceMap for sidecar mode", async () => {
    const mockHostResourceMap = {
      "example.com": {
        portProtocol: [{ port: 443, protocol: RemoteProtocol.TLS }],
      },
    };

    const mockPkg = {
      ...pkgMock,
      spec: {
        ...pkgMock.spec,
        network: {
          ...pkgMock.spec?.network,
          allow: [
            {
              direction: Direction.Egress,
              remoteHost: "example.com",
              port: 443,
              remoteProtocol: RemoteProtocol.TLS,
              selector: { app: "test" },
            },
          ],
        },
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

    vi.spyOn(egressMod, "createHostResourceMap").mockReturnValue(mockHostResourceMap);

    await expect(istioEgressResources(mockPkg, pkgMock.metadata!.namespace!)).rejects.toThrow(
      errorMessage,
    );
  });

  // Verifies sidecar mode errors when the required port is not exposed on the egress gateway
  it("should err if no egress gateway port with defined hostResourceMap for sidecar mode", async () => {
    const mockError = new Error(
      "Egress gateway does not expose port 1234 for host example.com. Please update the egress gateway service to expose this port.",
    );

    const mockHostResourceMap = {
      "example.com": {
        portProtocol: [{ port: 1234, protocol: RemoteProtocol.TLS }],
      },
    };

    const mockPkg = {
      ...pkgMock,
      spec: {
        ...pkgMock.spec,
        network: {
          ...pkgMock.spec?.network,
          allow: [
            {
              direction: Direction.Egress,
              remoteHost: "example.com",
              port: 1234,
              remoteProtocol: RemoteProtocol.TLS,
              selector: { app: "test" },
            },
          ],
        },
      },
    };

    updateEgressMocks(defaultEgressMocks);

    vi.spyOn(egressMod, "createHostResourceMap").mockReturnValue(mockHostResourceMap);

    await expect(istioEgressResources(mockPkg, pkgMock.metadata!.namespace!)).rejects.toThrowError(
      mockError,
    );
  });

  // Verifies no-op path when no hostResourceMap is generated (no egress to reconcile)
  it("should pass for undefined hostResourceMap", async () => {
    vi.spyOn(egressMod, "createHostResourceMap").mockReturnValue(undefined);

    await istioEgressResources(pkgMock, pkgMock.metadata!.namespace!);

    expect(egressMod.reconcileSharedEgressResources).toHaveBeenCalledTimes(1);
  });

  // Verifies SE/Sidecar resources are created for sidecar mode when valid allow rules exist
  it("should create egress resources for sidecar mode", async () => {
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

    const mockPkg = {
      ...pkgMock,
      spec: {
        ...pkgMock.spec,
        network: {
          ...pkgMock.spec?.network,
          allow: mockAllowList,
        },
      },
    };

    updateEgressMocks(defaultEgressMocks);

    vi.spyOn(egressMod, "createHostResourceMap").mockReturnValue(mockHostResourceMap);
    vi.spyOn(egressMod, "egressRequestedFromNetwork").mockReturnValue(mockAllowList);

    await istioEgressResources(mockPkg, pkgMock.metadata!.namespace!);

    expect(defaultEgressMocks.applySeMock).toHaveBeenCalledTimes(1);
    expect(defaultEgressMocks.applySidecarMock).toHaveBeenCalledTimes(2);
  });

  // Verifies no egress resources are created for sidecar mode when only non‑egress rules are present
  it("should not create egress resources for sidecar mode", async () => {
    updateEgressMocks(defaultEgressMocks);

    const mockAllowList = [
      {
        direction: Direction.Ingress,
        selector: {
          app: "my-app",
        },
        port: 80,
        remoteGenerated: RemoteGenerated.Anywhere,
      },
    ];

    // Create a mock package with the network configuration
    const mockPkg = {
      ...pkgMock,
      spec: {
        ...pkgMock.spec,
        network: {
          ...pkgMock.spec?.network,
          allow: mockAllowList,
        },
      },
    };

    vi.spyOn(egressMod, "createHostResourceMap").mockReturnValue(undefined);
    vi.spyOn(egressMod, "egressRequestedFromNetwork").mockReturnValue(mockAllowList);

    await istioEgressResources(mockPkg, pkgMock.metadata!.namespace!);

    expect(defaultEgressMocks.applySeMock).not.toHaveBeenCalled();
    expect(defaultEgressMocks.applySidecarMock).not.toHaveBeenCalled();
  });

  // Verifies ambient mode errors when the ambient egress waypoint namespace is missing
  it("should err if no egress waypoint namespace for ambient mode", async () => {
    const mockHostResourceMap = {
      "example.com": {
        portProtocol: [{ port: 443, protocol: RemoteProtocol.TLS }],
      },
    };

    const mockPkg = {
      ...pkgMock,
      spec: {
        ...pkgMock.spec,
        network: {
          ...pkgMock.spec?.network,
          serviceMesh: {
            mode: Mode.Ambient,
          },
          allow: [
            {
              direction: Direction.Egress,
              remoteHost: "example.com",
              port: 443,
              remoteProtocol: RemoteProtocol.TLS,
              selector: { app: "test" },
            },
          ],
        },
      },
    };

    const errorMessage = "Unable to get the egress waypoint namespace istio-egress-ambient.";

    const validateNamespaceMock = vi
      .spyOn(utils, "validateNamespace")
      .mockRejectedValue(new Error(errorMessage));

    vi.spyOn(egressMod, "createHostResourceMap").mockReturnValue(mockHostResourceMap);

    await expect(istioEgressResources(mockPkg, pkgMock.metadata!.namespace!)).rejects.toThrow(
      errorMessage,
    );

    expect(validateNamespaceMock).toHaveBeenCalledWith("istio-egress-ambient");
  });

  // Verifies ambient mode creates shared ServiceEntry and runs shared reconciliation when valid
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

    // Create a mock package with the network configuration and ambient mode
    const mockPkg = {
      ...pkgMock,
      spec: {
        ...pkgMock.spec,
        network: {
          ...pkgMock.spec?.network,
          serviceMesh: {
            mode: Mode.Ambient,
          },
          allow: [
            {
              direction: Direction.Egress,
              remoteHost: "example.com",
              port: 443,
              remoteProtocol: RemoteProtocol.TLS,
              selector: { app: "example-app1" },
            },
          ],
        },
      },
    };

    vi.spyOn(egressMod, "createHostResourceMap").mockReturnValue(mockHostResourceMap);
    vi.spyOn(egressMod, "egressRequestedFromNetwork").mockReturnValue(mockAllowList);

    await istioEgressResources(mockPkg, pkgMock.metadata!.namespace!);

    expect(validateNamespaceMock).toHaveBeenCalledWith("istio-egress-ambient");
    expect(egressMod.reconcileSharedEgressResources).toHaveBeenCalledTimes(1);
  });
});
