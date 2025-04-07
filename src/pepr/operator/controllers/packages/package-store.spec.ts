/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { describe, expect, it } from "@jest/globals";
import { PeprValidateRequest } from "pepr";
import { UDSPackage } from "../../crd";
import { PackageStore } from "./package-store";
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

describe("Package Store", () => {
  it("Should add a package", async () => {
    const mockReq = makeMockReq({});
    const ns = mockReq.Raw.metadata?.namespace || "";
    PackageStore.add(mockReq.Raw);
    expect(PackageStore.hasKey(ns)).toEqual(true);
  });

  it("Should add multiple unique packages", async () => {
    const mockReq = makeMockReq({});
    const ns = mockReq.Raw.metadata?.namespace || "";
    const mockReqNewPkg = makeMockReq({ metadata: { namespace: "test", name: "other-package" } });
    const nsNewPkg = mockReqNewPkg.Raw.metadata?.namespace || "";
    PackageStore.add(mockReqNewPkg.Raw);
    let pkgsExist = false;
    if (PackageStore.hasKey(ns) && PackageStore.hasKey(nsNewPkg)) {
      pkgsExist = true;
    }
    expect(pkgsExist).toEqual(true);
  });

  it("Should return the first package in the namespace", async () => {
    const mockReq = makeMockReq({});
    const ns = mockReq.Raw.metadata?.namespace || "";
    const pkgName = mockReq.Raw.metadata?.name || "";
    expect(PackageStore.getPkgName(ns)).toEqual(pkgName);
  });

  it("Should update an existing package", async () => {
    const mockReq = makeMockReq({ metadata: { namespace: "test", name: "other-package", labels: { test: "value"}}});
    const ns = mockReq.Raw.metadata?.namespace || "";
    const pkgName = mockReq.Raw.metadata?.name || "";
    PackageStore.add(mockReq.Raw)
    const updatedPackage = PackageStore.getPkgName(ns);
    expect(updatedPackage).toEqual(pkgName)
  });

  it("Should remove a package", async () => {
    const mockReq = makeMockReq({});
    const ns = mockReq.Raw.metadata?.namespace || "";
    PackageStore.remove(mockReq.Raw);
    expect(PackageStore.hasKey(ns)).toEqual(false);
  });
});
