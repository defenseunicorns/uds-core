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

// Helper function to create a package with SSO clients
const createPackageWithSsoClient = (
  namespace: string,
  name: string,
  clientId: string,
): UDSPackage => {
  return {
    metadata: {
      namespace,
      name,
    },
    spec: {
      network: {
        expose: [],
        allow: [],
      },
      sso: [
        {
          clientId,
          name: "Test Client",
          redirectUris: ["https://example.com/callback"],
        },
      ],
      monitor: [],
    },
  };
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
    const mockReq = makeMockReq({
      metadata: { namespace: "test", name: "other-package", labels: { test: "value" } },
    });
    const ns = mockReq.Raw.metadata?.namespace || "";
    const pkgName = mockReq.Raw.metadata?.name || "";
    PackageStore.add(mockReq.Raw);
    const updatedPackage = PackageStore.getPkgName(ns);
    expect(updatedPackage).toEqual(pkgName);
  });

  it("Should remove a package", async () => {
    const mockReq = makeMockReq({});
    const ns = mockReq.Raw.metadata?.namespace || "";
    PackageStore.remove(mockReq.Raw);
    expect(PackageStore.hasKey(ns)).toEqual(false);
  });

  describe("findPackagesWithSsoClientId", () => {
    // Reset the PackageStore before each test
    beforeEach(() => {
      PackageStore.init();
    });

    it("Should find a package with a specific SSO client ID", () => {
      // Create and add a package with an SSO client
      const pkg = createPackageWithSsoClient("test-ns", "test-app", "test-client-id");
      PackageStore.add(pkg);

      // Find packages with the client ID
      const result = PackageStore.findPackagesWithSsoClientId("test-client-id");

      // Verify the result
      expect(result.length).toEqual(1);
      expect(result[0].namespace).toEqual("test-ns");
      expect(result[0].name).toEqual("test-app");
      expect(result[0].pkg.spec?.sso?.[0].clientId).toEqual("test-client-id");
    });

    it("Should return an empty array when no packages have the client ID", () => {
      // Create and add a package with an SSO client
      const pkg = createPackageWithSsoClient("test-ns", "test-app", "test-client-id");
      PackageStore.add(pkg);

      // Find packages with a non-existent client ID
      const result = PackageStore.findPackagesWithSsoClientId("non-existent-client-id");

      // Verify the result is empty
      expect(result.length).toEqual(0);
    });

    it("Should find multiple packages with the same SSO client ID", () => {
      // Create and add multiple packages with the same SSO client ID
      const pkg1 = createPackageWithSsoClient("test-ns-1", "test-app-1", "shared-client-id");
      const pkg2 = createPackageWithSsoClient("test-ns-2", "test-app-2", "shared-client-id");
      PackageStore.add(pkg1);
      PackageStore.add(pkg2);

      // Find packages with the shared client ID
      const result = PackageStore.findPackagesWithSsoClientId("shared-client-id");

      // Verify the result contains both packages
      expect(result.length).toEqual(2);

      // Sort the results by namespace to make the test deterministic
      const sortedResults = result.sort((a, b) => a.namespace.localeCompare(b.namespace));

      expect(sortedResults[0].namespace).toEqual("test-ns-1");
      expect(sortedResults[0].name).toEqual("test-app-1");
      expect(sortedResults[0].pkg.spec?.sso?.[0].clientId).toEqual("shared-client-id");

      expect(sortedResults[1].namespace).toEqual("test-ns-2");
      expect(sortedResults[1].name).toEqual("test-app-2");
      expect(sortedResults[1].pkg.spec?.sso?.[0].clientId).toEqual("shared-client-id");
    });

    it("Should find a package with multiple SSO clients when one matches", () => {
      // Create a package with multiple SSO clients
      const pkg = createPackageWithSsoClient("test-ns", "test-app", "client-id-1");

      // Add a second SSO client to the package
      if (pkg.spec?.sso) {
        pkg.spec.sso.push({
          clientId: "client-id-2",
          name: "Second Test Client",
          redirectUris: ["https://example.com/callback2"],
        });
      }

      PackageStore.add(pkg);

      // Find packages with the second client ID
      const result = PackageStore.findPackagesWithSsoClientId("client-id-2");

      // Verify the result
      expect(result.length).toEqual(1);
      expect(result[0].namespace).toEqual("test-ns");
      expect(result[0].name).toEqual("test-app");
      expect(
        result[0].pkg.spec?.sso?.some(client => client.clientId === "client-id-2"),
      ).toBeTruthy();
    });
  });
});
