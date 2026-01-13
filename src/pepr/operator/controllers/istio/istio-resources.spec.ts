/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { K8s } from "pepr";
import type { Mock } from "vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IstioServiceEntry, IstioVirtualService, UDSPackage } from "../../crd";
import { Mode } from "../../crd/generated/package-v1alpha1";
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
    metadata: { name: "pkg", namespace: "ns", generation: 7 },
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

  beforeEach(() => {
    // Create stable spies once per test
    applyVS = vi.fn(async () => undefined);
    applySE = vi.fn(async () => undefined);

    // Reset K8s mock Apply per kind
    const k8sMock = K8s as unknown as Mock;
    type K8sApply = { Apply: (obj: unknown) => Promise<void> };
    k8sMock.mockImplementation((k: unknown): K8sApply => {
      if (k === IstioVirtualService) {
        return { Apply: applyVS } as K8sApply;
      }
      if (k === IstioServiceEntry) {
        return { Apply: applySE } as K8sApply;
      }
      return { Apply: vi.fn(async () => undefined) } as K8sApply;
    });

    // Stub purgeOrphans
    vi.spyOn(utils, "purgeOrphans").mockResolvedValue();

    // Stub generators with predictable payloads
    let vsIdx = 0;
    vi.spyOn(vsMod, "generateIngressVirtualService").mockImplementation(
      (_expose, ns, pkgName, gen): IstioVirtualService => {
        const name = `vs-${++vsIdx}`;
        return {
          apiVersion: "networking.istio.io/v1beta1",
          kind: "VirtualService",
          metadata: {
            name,
            namespace: ns,
            labels: { "uds/package": pkgName, "uds/generation": gen },
          },
          spec: { hosts: [vsIdx === 1 ? "a.uds.dev" : "b.uds.dev"] },
        } as unknown as IstioVirtualService;
      },
    );

    let seIdx = 0;
    vi.spyOn(seMod, "generateIngressServiceEntry").mockImplementation(
      (_expose, ns, pkgName, gen): IstioServiceEntry => {
        const name = `se-${++seIdx}`;
        return {
          apiVersion: "networking.istio.io/v1beta1",
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
