/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { WatchPhase } from "kubernetes-fluent-client/dist/fluent/shared-types.js";
import { PeprValidateRequest } from "pepr";
import { describe, expect, it } from "vitest";
import { UDSPackage } from "../../crd/index.js";
import { PackageStore } from "./package-store.js";
import { processPackages } from "./packages.js";

PackageStore.init();

const makeMockReq = (pkg: Partial<UDSPackage>) => {
  const defaultPkg: UDSPackage = {
    metadata: {
      namespace: "application-system",
      name: "application",
    },
    spec: {
      network: {
        expose: [],
        allow: [],
      },
      sso: [],
      monitor: [],
    },
  };
  return {
    Raw: { ...defaultPkg, ...pkg },
  } as unknown as PeprValidateRequest<UDSPackage>;
};

describe("Package Watch", () => {
  it("Should add a package", async () => {
    const mockReq = makeMockReq({});
    const ns = mockReq.Raw.metadata?.namespace || "";
    processPackages(mockReq.Raw, WatchPhase.Added);
    const addedPackage = PackageStore.hasKey(ns);
    expect(addedPackage).toBe(true);
  });

  it("Should add multiple unique packages", async () => {
    const mockReq = makeMockReq({});
    const ns = mockReq.Raw.metadata?.namespace || "";
    const mockReqNewPkg = makeMockReq({ metadata: { namespace: "test", name: "other-package" } });
    const nsNewPkg = mockReqNewPkg.Raw.metadata?.namespace || "";
    processPackages(mockReqNewPkg.Raw, WatchPhase.Added);
    let pkgsExist = false;
    if (PackageStore.hasKey(ns) && PackageStore.hasKey(nsNewPkg)) {
      pkgsExist = true;
    }
    expect(pkgsExist).toBe(true);
  });

  it("Should remove packages", async () => {
    const mockReq = makeMockReq({});
    const mockReqNewPkg = makeMockReq({ metadata: { namespace: "test", name: "other-package" } });
    const ns = mockReq.Raw.metadata?.namespace || "";
    const nsNewPkg = mockReqNewPkg.Raw.metadata?.namespace || "";
    processPackages(mockReq.Raw, WatchPhase.Deleted);
    processPackages(mockReqNewPkg.Raw, WatchPhase.Deleted);
    let pkgsExist = false;
    if (PackageStore.hasKey(ns) && PackageStore.hasKey(nsNewPkg)) {
      pkgsExist = true;
    }
    expect(pkgsExist).toBe(false);
  });
});
