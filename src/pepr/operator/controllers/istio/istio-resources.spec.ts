/**
 * Copyright 2024-2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { K8s } from "pepr";
import type { Mock } from "vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IstioServiceEntry, IstioVirtualService, UDSPackage } from "../../crd";
import { ExposeProtocol, Mode } from "../../crd/generated/package-v1alpha1";
import * as utils from "../utils";
import { getPackageId, getSharedAnnotationKey, istioResources } from "./istio-resources";
import * as seMod from "./service-entry";
import * as vsMod from "./virtual-service";

vi.mock("pepr", () => {
  return {
    K8s: vi.fn(() => ({
      Apply: vi.fn(async () => undefined),
    })),
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
      VirtualService: "VirtualService",
      ServiceEntry: "ServiceEntry",
      IstioSidecar: "Sidecar",
      IstioAuthorizationPolicy: "AuthorizationPolicy",
    },
  };
});

describe("istio-resources (ingress)", () => {
  const pkgBase: UDSPackage = {
    apiVersion: "uds.dev/v1alpha1",
    kind: "Package",
    metadata: { name: "pkg", namespace: "ns", generation: 7, uid: "pkg-uid" },
    spec: {
      network: {
        expose: [{ host: "a" }, { host: "b" }],
        allow: [],
        serviceMesh: { mode: Mode.Sidecar },
      },
      sso: [],
      monitor: [],
    },
  } as unknown as UDSPackage;

  let applyVS: ReturnType<typeof vi.fn>;
  let applySE: ReturnType<typeof vi.fn>;
  const listProtectedRoutes = vi.fn();

  beforeEach(() => {
    // Create stable spies once per test
    applyVS = vi.fn(async () => undefined);
    applySE = vi.fn(async () => undefined);
    listProtectedRoutes.mockReset().mockResolvedValue({ items: [] });

    // Reset K8s mock Apply per kind
    const k8sMock = K8s as unknown as Mock;
    type K8sApply = { Apply: (obj: unknown) => Promise<void> };
    k8sMock.mockImplementation((k: unknown): K8sApply => {
      if (k === IstioVirtualService) {
        return {
          Apply: applyVS,
          InNamespace: vi.fn().mockReturnThis(),
          WithLabel: vi.fn().mockReturnThis(),
          Get: listProtectedRoutes,
        } as K8sApply;
      }
      if (k === IstioServiceEntry) {
        return { Apply: applySE } as K8sApply;
      }
      return { Apply: vi.fn(async () => undefined) } as K8sApply;
    });

    // Stub purgeOrphans
    vi.spyOn(utils, "purgeOrphans").mockResolvedValue();

    // Stub generators with predictable payloads
    vi.spyOn(vsMod, "generateIngressVirtualService").mockImplementation(
      (expose, ns, pkgName, gen): IstioVirtualService => {
        return {
          apiVersion: "networking.istio.io/v1",
          kind: "VirtualService",
          metadata: {
            name: `vs-${expose.host}`,
            namespace: ns,
            labels: { "uds/package": pkgName, "uds/generation": gen },
          },
          spec: { hosts: [`${expose.host}.uds.dev`], http: [{}] },
        } as unknown as IstioVirtualService;
      },
    );

    let seIdx = 0;
    vi.spyOn(seMod, "generateIngressServiceEntry").mockImplementation(
      (_expose, ns, pkgName, gen): IstioServiceEntry => {
        const name = `se-${++seIdx}`;
        return {
          apiVersion: "networking.istio.io/v1",
          kind: "ServiceEntry",
          metadata: {
            name,
            namespace: ns,
            labels: { "uds/package": pkgName, "uds/generation": gen },
          },
          spec: {},
        } as unknown as IstioServiceEntry;
      },
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Verifies VS/SE are applied per expose and unique hosts are returned; also checks purge calls
  it("applies a VirtualService and ServiceEntry per expose and returns unique hosts", async () => {
    const hosts = await istioResources(pkgBase, pkgBase.metadata!.namespace!);

    expect(applyVS).toHaveBeenCalledTimes(2);
    expect(applySE).toHaveBeenCalledTimes(2);
    expect(hosts.sort()).toEqual(["a.uds.dev", "b.uds.dev"]);

    // purgeOrphans should be invoked for VS, SE, Sidecar, and AuthorizationPolicy
    const gen = String(pkgBase.metadata!.generation!);
    expect(utils.purgeOrphans).toHaveBeenCalledWith(
      gen,
      "ns",
      "pkg",
      IstioVirtualService,
      expect.anything(),
    );
    expect(utils.purgeOrphans).toHaveBeenCalledWith(
      gen,
      "ns",
      "pkg",
      IstioServiceEntry,
      expect.anything(),
    );
    expect(utils.purgeOrphans).toHaveBeenCalledTimes(3);
  });

  it("skips UDP expose entries", async () => {
    const pkg = {
      ...pkgBase,
      spec: {
        network: {
          expose: [
            { host: "a" },
            {
              protocol: ExposeProtocol.UDP,
              service: "game-server",
              selector: { app: "game" },
              port: 7777,
            },
          ],
        },
      },
    } as unknown as UDSPackage;

    const hosts = await istioResources(pkg, pkg.metadata!.namespace!);

    expect(applyVS).toHaveBeenCalledTimes(1);
    expect(applySE).toHaveBeenCalledTimes(1);
    expect(hosts).toEqual(["a.uds.dev"]);
  });

  it.each([
    ["a delete conflict", { name: "old", labels: { "uds/generation": "6" } }],
    [
      "termination",
      { name: "old", labels: { "uds/generation": "6" }, deletionTimestamp: new Date() },
    ],
  ])(
    "retains protection after %s until the obsolete route disappears",
    async (_reason, metadata) => {
      const pkg = { ...pkgBase, spec: { network: { expose: [] } } };
      listProtectedRoutes.mockResolvedValueOnce({ items: [{ metadata }] });
      await expect(istioResources(pkg, "ns")).rejects.toThrow(
        "Waiting for protected VirtualServices",
      );
      expect(utils.purgeOrphans).toHaveBeenCalledTimes(1);
      await expect(istioResources(pkg, "ns")).resolves.toEqual([]);
    },
  );

  it("accepts only active protected routes for the current generation", async () => {
    const pkg = {
      ...pkgBase,
      spec: {
        ...pkgBase.spec,
        sso: [{ name: "Browser", clientId: "browser", authservice: { exposeHost: "a" } }],
      },
    };
    const metadata = { name: "vs-a", labels: { "uds/generation": "7" } };
    listProtectedRoutes.mockResolvedValueOnce({ items: [{ metadata }] });
    expect(await istioResources(pkg, "ns")).toEqual(["a.uds.dev", "b.uds.dev"]);
    listProtectedRoutes.mockResolvedValueOnce({
      items: [{ metadata: { ...metadata, deletionTimestamp: new Date() } }],
    });
    await expect(istioResources(pkg, "ns")).rejects.toThrow(
      "Waiting for protected VirtualServices",
    );
  });
});

describe("helpers", () => {
  // Verifies helper composes name-namespace string
  it("getPackageId composes name-namespace", () => {
    const pkg = { metadata: { name: "n", namespace: "s" } } as UDSPackage;
    expect(getPackageId(pkg)).toBe("n-s");
  });

  // Verifies helper prefixes uds.dev/user- for shared annotation keys
  it("getSharedAnnotationKey prefixes uds.dev/user-", () => {
    expect(getSharedAnnotationKey("abc")).toBe("uds.dev/user-abc");
  });
});
